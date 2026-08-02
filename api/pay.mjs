import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const BOQRIS_BASE = process.env.BOQRIS_BASE_URL || "https://api.boqris.id";
const BOQRIS_UNIQUE_MAX = Math.max(1, Number(process.env.BOQRIS_UNIQUE_MAX || 200) || 200);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL || process.env.BOT_EMAIL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD || process.env.BOT_PASSWORD;

let adminPromise = null;

async function getAdmin() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) {
    throw new Error("SUPABASE_EMAIL/PASSWORD belum di-set");
  }
  if (!adminPromise) {
    adminPromise = (async () => {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error } = await sb.auth.signInWithPassword({
        email: SUPABASE_EMAIL,
        password: SUPABASE_PASSWORD,
      });
      if (error) throw new Error("Login Supabase gagal: " + error.message);
      return sb;
    })();
  }
  return adminPromise;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function verifyWebhook(rawBody, signatureHeader) {
  const secret = process.env.BOQRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  const candidates = [secret, secret.replace(/^whsec_/, "")];
  for (const candidate of candidates) {
    const expected = "sha256=" + createHmac("sha256", candidate).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader || "", "utf8");
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

async function createBoqrisTransaction(amount, invoiceNo) {
  const apiKey = process.env.BOQRIS_API_KEY;
  const merchantId = process.env.BOQRIS_MERCHANT_ID;
  if (!apiKey || !merchantId) throw new Error("BOQRIS_API_KEY atau BOQRIS_MERCHANT_ID belum di-set");

  const basePayload = { merchant_id: merchantId };
  if (invoiceNo) basePayload.invoice_no = String(invoiceNo).slice(0, 25);

  for (let code = 1; code <= BOQRIS_UNIQUE_MAX; code++) {
    const qrAmount = amount - code;
    if (qrAmount <= 0) break;
    const payload = { ...basePayload, amount: qrAmount, unique_amount: false };
    const bo = await fetch(`${BOQRIS_BASE}/api/v1/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await bo.json();
    if (bo.status === 201) {
      data.requested_amount = amount;
      data.custom_unique_code = code;
      return data;
    }
    if (bo.status !== 409) {
      throw new Error(data.error || data.message || `BOQris ${bo.status}`);
    }
  }
  throw new Error("Semua kode unik terpakai, coba lagi nanti");
}

async function checkBoqrisTransaction(transactionId) {
  const apiKey = process.env.BOQRIS_API_KEY;
  const bo = await fetch(`${BOQRIS_BASE}/api/v1/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return bo.json();
}

async function confirmOrder(sb, orderId, transactionId, boData) {
  const bo = boData || await checkBoqrisTransaction(transactionId);
  if (bo.status !== "paid") {
    return { status: bo.status || "pending", confirmed: false };
  }

  const { data: order, error } = await sb
    .from("orders")
    .select("id, customer_id, total, paid_total, order_type, account_id, status, notes")
    .eq("id", orderId)
    .single();
  if (error || !order) {
    return { error: "Order tidak ditemukan" };
  }

  if ((order.paid_total || 0) >= (order.total || 0)) {
    return { status: "paid", confirmed: true, already: true };
  }

  const now = new Date().toISOString();
  const payDelta = (order.total || 0) - (order.paid_total || 0);
  const newStatus = ["new", "belum-ready", "ready"].includes(order.status) ? "paid" : order.status;

  let contactName = "";
  if (order.customer_id) {
    const { data: cust } = await sb
      .from("customers")
      .select("name")
      .eq("id", order.customer_id)
      .single();
    contactName = cust?.name || "";
  }

  await sb
    .from("orders")
    .update({
      paid_total: order.total,
      payment_type: "qris",
      status: newStatus,
      notes: order.notes
        ? `${order.notes}\nQRIS ${bo.amount} (${transactionId.slice(0, 8)})`
        : `QRIS ${bo.amount} (${transactionId.slice(0, 8)})`,
      updated_at: now,
    })
    .eq("id", orderId);

  if (order.account_id && payDelta > 0) {
    const txId = randomUUID();
    await sb.from("account_transactions").insert({
      id: txId,
      account_id: order.account_id,
      order_id: orderId,
      order_type: order.order_type,
      contact_name: contactName,
      amount: order.order_type === "penjualan" ? payDelta : -payDelta,
      description: `Penjualan - ${contactName}`,
      date: now.split("T")[0],
      created_at: now,
    });
    const { data: acc } = await sb
      .from("accounts")
      .select("balance")
      .eq("id", order.account_id)
      .single();
    if (acc) {
      await sb
        .from("accounts")
        .update({ balance: (acc.balance || 0) + (order.order_type === "penjualan" ? payDelta : -payDelta) })
        .eq("id", order.account_id);
    }
  }

  return { status: "paid", confirmed: true };
}

async function findOrderByInvoiceNo(sb, invoiceNo) {
  const prefix = String(invoiceNo || "").slice(0, 25);
  if (!prefix) return null;
  const { data } = await sb
    .from("orders")
    .select("id, total, paid_total, status")
    .or(`id.ilike.${prefix}%`);
  return (data || [])[0] || null;
}

async function findPaymentGroupByInvoiceNo(sb, invoiceNo) {
  const prefix = String(invoiceNo || "").slice(0, 25);
  if (!prefix) return null;
  const { data } = await sb
    .from("qris_payments")
    .select("id, order_ids, status")
    .or(`id.ilike.${prefix}%`);
  return (data || [])[0] || null;
}

async function loadOrderInfo(sb, order) {
  const { data: items } = await sb
    .from("order_items")
    .select("product_name, quantity")
    .eq("order_id", order.id);
  let customerName = "";
  if (order.customer_id) {
    const { data: cust } = await sb
      .from("customers")
      .select("name")
      .eq("id", order.customer_id)
      .single();
    customerName = cust?.name || "";
  }
  return {
    id: order.id,
    customer_name: customerName,
    total: order.total,
    paid_total: order.paid_total,
    sisa: (order.total || 0) - (order.paid_total || 0),
    items: (items || []).map((i) => `${i.product_name} x${i.quantity}`),
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 404, { error: "Not found" });
    return;
  }

  try {
    const rawBody = (await readBody(req)) || "";
    const body = JSON.parse(rawBody || "{}");
    const sb = await getAdmin();

    if (body.event || body.type === "payment.success" || body.type === "payment.expired") {
      const event = body.event || body.type;
      if (!verifyWebhook(rawBody, req.headers["x-boqris-signature"])) {
        json(res, 401, { error: "Signature tidak valid" });
        return;
      }
      if (event !== "payment.success") {
        json(res, 200, { received: true });
        return;
      }
      const txId = String(body.data?.transaction_id || body.transaction_id || "");
      const invoiceNo = String(body.data?.invoice_no || body.invoice_no || "");
      if (!txId) {
        json(res, 400, { error: "transaction_id tidak ada" });
        return;
      }

      const group = invoiceNo ? await findPaymentGroupByInvoiceNo(sb, invoiceNo) : null;
      if (group && Array.isArray(group.order_ids) && group.order_ids.length > 0) {
        if (group.status === "paid") {
          json(res, 200, { status: "paid", confirmed: true, already: true });
          return;
        }
        const bo = await checkBoqrisTransaction(txId);
        if (bo.status !== "paid") {
          json(res, 200, { status: bo.status || "pending", confirmed: false });
          return;
        }
        const results = [];
        for (const orderId of group.order_ids) {
          const r = await confirmOrder(sb, orderId, txId, bo);
          if (r.error) {
            json(res, 404, r);
            return;
          }
          results.push({ orderId, ...r });
        }
        await sb.from("qris_payments").update({ status: "paid" }).eq("id", group.id);
        json(res, 200, { status: "paid", confirmed: true, orders: results });
        return;
      }

      const order = invoiceNo
        ? await findOrderByInvoiceNo(sb, invoiceNo)
        : null;
      if (!order) {
        json(res, 404, { error: "Order tidak ditemukan" });
        return;
      }
      const result = await confirmOrder(sb, order.id, txId);
      json(res, result.error ? 404 : 200, result);
      return;
    }

    if (body.action === "create") {
      const orderIdsRaw = Array.isArray(body.orderIds)
        ? body.orderIds.map((x) => String(x).trim()).filter(Boolean)
        : body.orderId
          ? [String(body.orderId).trim()]
          : [];
      if (orderIdsRaw.length === 0) {
        json(res, 400, { error: "orderId wajib diisi" });
        return;
      }

      const { data: orders, error: ordersErr } = await sb
        .from("orders")
        .select("id, customer_id, total, paid_total, order_type, account_id, notes, status")
        .in("id", orderIdsRaw);
      if (ordersErr || !orders || orders.length === 0) {
        json(res, 404, { error: "Order tidak ditemukan" });
        return;
      }

      const validOrders = orders.filter((o) => (o.total || 0) - (o.paid_total || 0) > 0);
      if (validOrders.length === 0) {
        json(res, 400, { error: "Semua order sudah lunas" });
        return;
      }

      const sisaTotal = validOrders.reduce(
        (sum, o) => sum + ((o.total || 0) - (o.paid_total || 0)),
        0
      );

      if (validOrders.length === 1) {
        const order = validOrders[0];
        const sisa = (order.total || 0) - (order.paid_total || 0);
        const tx = await createBoqrisTransaction(sisa, order.id.slice(0, 25));
        const info = await loadOrderInfo(sb, order);
        json(res, 201, { order: info, tx });
        return;
      }

      const groupId = "qg-" + randomUUID().replace(/-/g, "").slice(0, 22);
      const invoiceNo = groupId.slice(0, 25);
      const { error: groupErr } = await sb.from("qris_payments").insert({
        id: invoiceNo,
        order_ids: validOrders.map((o) => o.id),
        amount: sisaTotal,
        status: "pending",
      });
      if (groupErr) {
        json(res, 500, { error: "Gagal menyimpan pembayaran gabungan: " + groupErr.message });
        return;
      }

      const tx = await createBoqrisTransaction(sisaTotal, invoiceNo);

      const infoList = [];
      for (const order of validOrders) {
        infoList.push(await loadOrderInfo(sb, order));
      }

      json(res, 201, {
        group: {
          id: invoiceNo,
          order_ids: validOrders.map((o) => o.id),
          sisa_total: sisaTotal,
        },
        orders: infoList,
        tx,
      });
      return;
    }

    if (body.action === "status") {
      const tx = await checkBoqrisTransaction(String(body.transactionId || ""));
      json(res, 200, { status: tx.status, tx });
      return;
    }

    if (body.action === "confirm") {
      const orderIds = Array.isArray(body.orderIds)
        ? body.orderIds.map((x) => String(x).trim()).filter(Boolean)
        : body.orderId
          ? [String(body.orderId).trim()]
          : [];
      const transactionId = String(body.transactionId || "");
      if (orderIds.length === 0 || !transactionId) {
        json(res, 400, { error: "orderId dan transactionId wajib diisi" });
        return;
      }
      const bo = await checkBoqrisTransaction(transactionId);
      if (bo.status !== "paid") {
        json(res, 200, { status: bo.status || "pending", confirmed: false });
        return;
      }
      const results = [];
      for (const orderId of orderIds) {
        const r = await confirmOrder(sb, orderId, transactionId, bo);
        if (r.error) {
          json(res, 404, r);
          return;
        }
        results.push({ orderId, ...r });
      }
      json(res, 200, { status: "paid", confirmed: true, orders: results });
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
