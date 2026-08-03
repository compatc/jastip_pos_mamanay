import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import webpush from "web-push";

const BOQRIS_BASE = process.env.BOQRIS_BASE_URL || "https://api.boqris.id";
const BOQRIS_UNIQUE_MAX = Math.max(1, Number(process.env.BOQRIS_UNIQUE_MAX || 200) || 200);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@mamanay.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

async function summarizeOrders(sb, orders) {
  const names = [];
  let total = 0;
  for (const o of orders || []) {
    total += Number(o.total || 0);
    if (o.customer_id) {
      const { data: cust } = await sb
        .from("customers")
        .select("name")
        .eq("id", o.customer_id)
        .single();
      if (cust?.name && !names.includes(cust.name)) names.push(cust.name);
    }
  }
  return { names, total };
}

// Kirim notifikasi push ke semua perangkat yang terdaftar (user yang sama dengan server).
async function sendPushNotification(sb, { title, body, url }) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const { data: subs, error } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (error || !subs || subs.length === 0) return;
    const payload = JSON.stringify({ title, body, url });
    await Promise.allSettled(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (err) {
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            await sb.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      })
    );
  } catch {
    // push gagal, jangan mengganggu alur pembayaran
  }
}

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

  const basePayload = { merchant_id: merchantId, unique_amount: false };
  if (invoiceNo) basePayload.invoice_no = String(invoiceNo).slice(0, 25);

  for (let code = 1; code <= BOQRIS_UNIQUE_MAX; code++) {
    const qrAmount = amount - code;
    if (qrAmount <= 0) break;
    const payload = { ...basePayload, amount: qrAmount };
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
    if (bo.status === 409) continue;
    throw new Error(data.error || data.message || `BOQris ${bo.status}`);
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

async function confirmOrder(sb, orderId, transactionId, boData, amountOverride) {
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

  // Nominal yang benar-benar dibayar (setelah kode unik/deduksi).
  // Harga jual (total) diikuti ke nominal ini supaya catatan = uang yang diterima.
  const shareOfPayment = Number(
    amountOverride != null && amountOverride > 0
      ? amountOverride
      : bo.amount || bo.base_amount || ((order.total || 0) - (order.paid_total || 0))
  );
  if (!(shareOfPayment > 0)) {
    return { status: "paid", confirmed: true, already: true };
  }

  const finalTotal = (order.paid_total || 0) + shareOfPayment;
  const now = new Date().toISOString();
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

  const noteAmount = amountOverride != null && amountOverride > 0 ? shareOfPayment : bo.amount;
  const sisaInvoice = (order.total || 0) - (order.paid_total || 0);
  const paidNote =
    Number(sisaInvoice) !== Number(shareOfPayment)
      ? `QRIS ${shareOfPayment} (sisa ${sisaInvoice}, kode unik ${Number(sisaInvoice) - Number(shareOfPayment)}) (${transactionId.slice(0, 8)})`
      : `QRIS ${noteAmount} (${transactionId.slice(0, 8)})`;

  await sb
    .from("orders")
    .update({
      total: finalTotal,
      paid_total: finalTotal,
      payment_type: "qris",
      status: newStatus,
      notes: order.notes
        ? `${order.notes}\n${paidNote}`
        : paidNote,
      updated_at: now,
    })
    .eq("id", orderId);

  if (order.account_id) {
    const txId = randomUUID();
    await sb.from("account_transactions").insert({
      id: txId,
      account_id: order.account_id,
      order_id: orderId,
      order_type: order.order_type,
      contact_name: contactName,
      amount: order.order_type === "penjualan" ? shareOfPayment : -shareOfPayment,
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
        .update({ balance: (acc.balance || 0) + (order.order_type === "penjualan" ? shareOfPayment : -shareOfPayment) })
        .eq("id", order.account_id);
    }
  }

  return { status: "paid", confirmed: true };
}

// Bagi satu pembayaran QRIS gabungan ke tiap order secara proporsional sisa tagihannya.
function allocatePaymentShares(orders, totalPaid) {
  const sisa = (orders || []).map((o) => Math.max(0, (o.total || 0) - (o.paid_total || 0)));
  const totalSisa = sisa.reduce((a, b) => a + b, 0);
  const shares = sisa.map(() => 0);
  if (!(totalSisa > 0) || !(totalPaid > 0)) return shares;
  for (let i = 0; i < sisa.length; i++) {
    shares[i] = Math.round((totalPaid * sisa[i]) / totalSisa);
  }
  const adjustIdx = sisa.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
  let diff = totalPaid - shares.reduce((a, b) => a + b, 0);
  let j = 0;
  while (diff !== 0 && adjustIdx.length > 0) {
    const idx = adjustIdx[j % adjustIdx.length];
    shares[idx] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    j++;
  }
  return shares;
}

async function findOrderByInvoiceNo(sb, invoiceNo) {
  const prefix = String(invoiceNo || "").slice(0, 25);
  if (!prefix) return null;
  const { data } = await sb
    .from("orders")
    .select("id, total, paid_total, status, customer_id")
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
        const { data: grpOrders } = await sb
          .from("orders")
          .select("id, total, paid_total")
          .in("id", group.order_ids);
        const shares = allocatePaymentShares(
          grpOrders || [],
          Number(bo.amount || bo.base_amount || 0)
        );
        const results = [];
        for (let gi = 0; gi < group.order_ids.length; gi++) {
          const r = await confirmOrder(sb, group.order_ids[gi], txId, bo, shares[gi]);
          if (r.error) {
            json(res, 404, r);
            return;
          }
          results.push({ orderId: group.order_ids[gi], ...r });
        }
        await sb.from("qris_payments").update({ status: "paid" }).eq("id", group.id);
        const fresh = results.filter((r) => r.confirmed && !r.already);
        if (fresh.length > 0) {
          const paidAmount = Number(bo.amount || bo.base_amount || 0);
          const info = await summarizeOrders(sb, grpOrders || []);
          await sendPushNotification(sb, {
            title: "QRIS Lunas",
            body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}`,
            url: "/orders",
          });
        }
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
      const bo = await checkBoqrisTransaction(txId);
      const result = await confirmOrder(sb, order.id, txId, bo);
      if (!result.error && result.confirmed && !result.already) {
        const info = await summarizeOrders(sb, [order]);
        const paidAmount = Number(bo.amount || bo.base_amount || 0);
        await sendPushNotification(sb, {
          title: "QRIS Lunas",
          body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}`,
          url: `/orders/${order.id}`,
        });
      }
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
      const { data: confOrders } = await sb
        .from("orders")
        .select("id, total, paid_total, customer_id")
        .in("id", orderIds);
      const shares = allocatePaymentShares(
        confOrders || [],
        Number(bo.amount || bo.base_amount || 0)
      );
      const results = [];
      for (let ci = 0; ci < orderIds.length; ci++) {
        const r = await confirmOrder(sb, orderIds[ci], transactionId, bo, shares[ci]);
        if (r.error) {
          json(res, 404, r);
          return;
        }
        results.push({ orderId: orderIds[ci], ...r });
      }
      const fresh = results.filter((r) => r.confirmed && !r.already);
      if (fresh.length > 0) {
        const paidAmount = Number(bo.amount || bo.base_amount || 0);
        const info = await summarizeOrders(sb, confOrders || []);
        await sendPushNotification(sb, {
          title: "QRIS Lunas",
          body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}`,
          url: "/orders",
        });
      }
      json(res, 200, { status: "paid", confirmed: true, orders: results });
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
