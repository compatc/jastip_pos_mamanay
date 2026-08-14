import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import webpush from "web-push";
import QRCode from "qrcode";

const BOQRIS_BASE = process.env.BOQRIS_BASE_URL || "https://api.boqris.id";
const BOQRIS_UNIQUE_MAX = Math.max(1, Number(process.env.BOQRIS_UNIQUE_MAX || 200) || 200);
const BOQRIS_EXPIRES_IN = Math.min(Math.max(Number(process.env.BOQRIS_EXPIRES_IN || 3600) || 3600, 60), 3600);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@mamanay.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

export async function summarizeOrders(sb, orders) {
  const names = [];
  let total = 0;
  const productQtys = new Map();
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
    const { data: items } = await sb
      .from("order_items")
      .select("product_name, quantity")
      .eq("order_id", o.id);
    for (const it of items || []) {
      productQtys.set(it.product_name, (productQtys.get(it.product_name) || 0) + Number(it.quantity || 0));
    }
  }
  const lines = Array.from(productQtys.entries()).map(([name, qty]) => `${name} x${qty}`);
  return { names, total, lines };
}

// Kirim notifikasi push ke semua perangkat yang terdaftar (user yang sama dengan server).
export async function sendPushNotification(sb, { title, body, url, type, orderIds, amount }) {
  try {
    const { data: subs, error } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && !error && subs && subs.length > 0) {
      const payload = JSON.stringify({ title, body, url });
      await Promise.allSettled(
        subs.map(async (s) => {
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
    }
    try {
      const { data: { user } } = await sb.auth.getUser();
      await sb.from("notifications").insert({
        user_id: user?.id,
        title: title || "QRIS Lunas",
        body: body || "",
        url: url || "/orders",
        type: type || "qris",
        order_ids: orderIds || [],
        amount: amount || 0,
      });
    } catch {
      // simpan riwayat gagal, jangan mengganggu alur pembayaran
    }
  } catch {
    // push gagal, jangan mengganggu alur pembayaran
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL || process.env.BOT_EMAIL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD || process.env.BOT_PASSWORD;

let adminPromise = null;

export async function getAdmin() {
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

  const basePayload = { merchant_id: merchantId, unique_amount: false, expires_in: BOQRIS_EXPIRES_IN };
  if (invoiceNo) basePayload.invoice_no = String(invoiceNo).slice(0, 25);

  const FETCH_TIMEOUT_MS = 5000;
  const code = Math.floor(Math.random() * 100) + 1;
  const qrAmount = amount - code;

  const payload = { ...basePayload, amount: qrAmount };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const bo = await fetch(`${BOQRIS_BASE}/api/v1/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await bo.json();
    if (bo.status === 201) {
      data.requested_amount = amount;
      data.custom_unique_code = code;
      return data;
    }
    throw new Error(data.error || data.message || `BOQris ${bo.status}`);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("BOQris API timeout, coba lagi nanti");
    }
    throw err;
  }
}

export async function checkBoqrisTransaction(transactionId) {
  const apiKey = process.env.BOQRIS_API_KEY;
  const bo = await fetch(`${BOQRIS_BASE}/api/v1/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return bo.json();
}

export async function confirmOrder(sb, orderId, transactionId, boData, amountOverride) {
  const bo = boData || await checkBoqrisTransaction(transactionId);
  if (bo.status !== "paid") {
    return { status: bo.status || "pending", confirmed: false };
  }

  const { data: order, error } = await sb
    .from("orders")
    .select("id, customer_id, total, paid_total, diskon, order_type, account_id, status, notes")
    .eq("id", orderId)
    .single();
  if (error || !order) {
    return { error: "Order tidak ditemukan" };
  }

  if ((order.paid_total || 0) >= (order.total || 0)) {
    return { status: "paid", confirmed: true, already: true };
  }

  // Re-read current paid_total to prevent race condition (webhook + polling)
  const { data: freshOrder } = await sb
    .from("orders")
    .select("paid_total, total")
    .eq("id", orderId)
    .single();
  const currentPaidTotal = freshOrder?.paid_total ?? order.paid_total;
  const currentTotal = freshOrder?.total ?? order.total;
  if ((currentPaidTotal || 0) >= (currentTotal || 0)) {
    return { status: "paid", confirmed: true, already: true };
  }

  // Nominal yang benar-benar dibayar (setelah kode unik/deduksi).
  // Kode unik = selisih kecil (<= BOQRIS_UNIQUE_MAX) antara tagihan dan yang
  // dibayar; dicatat sebagai DISKON order (total dikurangi kode unik) sehingga
  // invoice = uang yang diterima dan order lunas tanpa dipaksa.
  const shareOfPayment = Number(
    amountOverride != null && amountOverride > 0
      ? amountOverride
      : bo.amount || bo.base_amount || ((currentTotal || 0) - (currentPaidTotal || 0))
  );
  if (!(shareOfPayment > 0)) {
    return { status: "paid", confirmed: true, already: true };
  }

  const now = new Date().toISOString();
  const newStatus = order.status === "ready" ? "paid" : order.status;

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
  const sisaInvoice = (currentTotal || 0) - (currentPaidTotal || 0);

  // Kode unik: hanya jika bayar KURANG dari sisa (potongan QRIS)
  const rawDiff = Number(sisaInvoice) - Number(shareOfPayment);
  const kodeUnik = rawDiff > 0 ? rawDiff : 0;
  const isKodeUnik = Number(shareOfPayment) > 0 && kodeUnik > 0;

  // Overpayment: bayar lebih dari sisa → cap di sisa, tidak ada diskon tambahan
  const effectivePayment = Math.min(shareOfPayment, sisaInvoice);

  const finalTotal = isKodeUnik ? (currentTotal || 0) - kodeUnik : (currentTotal || 0);
  const finalDiskon = isKodeUnik ? (order.diskon || 0) + kodeUnik : (order.diskon || 0);
  const finalPaid = (currentPaidTotal || 0) + effectivePayment;
  const paidNote = isKodeUnik
    ? `QRIS ${effectivePayment} (kode unik ${kodeUnik}) (${transactionId.slice(0, 8)})`
    : Number(sisaInvoice) !== Number(effectivePayment)
      ? `QRIS ${effectivePayment} (sisa ${sisaInvoice}) (${transactionId.slice(0, 8)})`
      : `QRIS ${noteAmount} (${transactionId.slice(0, 8)})`;

  if (shareOfPayment > sisaInvoice) {
    console.log(`[OVERPAY] Order ${orderId}: paid ${shareOfPayment} > sisa ${sisaInvoice}, capped to ${effectivePayment}`);
  }

  // Optimistic lock: hanya 1 yang berhasil update per order, sehingga
  // konfirmasi ganda (polling app + webhook) tidak mengkredit 2x.
  let lockQuery = sb.from("orders").update({
    total: finalTotal,
    diskon: finalDiskon,
    paid_total: finalPaid,
    payment_type: "qris",
    status: newStatus,
    notes: order.notes
      ? `${order.notes}\n${paidNote}`
      : paidNote,
    updated_at: now,
  }).eq("id", orderId);
  if (currentPaidTotal == null) {
    lockQuery = lockQuery.is("paid_total", null);
  } else {
    lockQuery = lockQuery.eq("paid_total", currentPaidTotal);
  }
  const { data: updatedRows, error: updErr } = await lockQuery.select("id");
  if (updErr) {
    return { error: "Gagal mengupdate order: " + updErr.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    // Ada request lain yang sudah konfirmasi lebih dulu
    return { status: "paid", confirmed: true, already: true };
  }

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

// Bagi satu pembayaran QRIS gabungan: semua order dibayar lunas sesuai sisa
// tagihannya, lalu selisih (kode unik/rounding) dipotong mundur mulai order
// TERAKHIR sehingga nominal order lain tetap persis harga barangnya.
export function allocatePaymentShares(orders, totalPaid) {
  const sisa = (orders || []).map((o) => Math.max(0, (o.total || 0) - (o.paid_total || 0)));
  const shares = sisa.map(() => 0);
  const totalSisa = sisa.reduce((a, b) => a + b, 0);
  if (!(totalSisa > 0) || !(totalPaid > 0)) return shares;

  for (let i = 0; i < sisa.length; i++) shares[i] = sisa[i];

  let remaining = totalSisa - totalPaid;
  for (let i = shares.length - 1; i >= 0 && remaining > 0; i--) {
    const cut = Math.min(shares[i], remaining);
    shares[i] -= cut;
    remaining -= cut;
  }
  if (remaining < 0 && shares.length > 0) {
    shares[shares.length - 1] += -remaining;
  }
  return shares;
}

// Cek semua pembayaran QRIS pending yang menyimpan transaction_id, konfirmasi
// yang ternyata sudah dibayar di BOQris, lalu kirim notifikasi. Dipanggil oleh
// poll dari halaman web (action "reconcile") dan oleh cron (/api/qris-reconcile)
// sehingga pembayaran tetap dikonfirmasi walau halaman PayOrder ditutup.
export async function reconcilePending(sb, limit = 30) {
  const { data: pendings, error } = await sb
    .from("qris_payments")
    .select("id, order_ids, transaction_id, amount")
    .eq("status", "pending")
    .not("transaction_id", "is", null)
    .limit(limit);
  if (error) throw new Error("Gagal memuat pembayaran pending: " + error.message);

  const results = [];
  for (const g of pendings || []) {
    try {
      const bo = await checkBoqrisTransaction(g.transaction_id);
      if (bo.status !== "paid") {
        if (bo.status === "expired") {
          await sb.from("qris_payments").update({ status: "expired" }).eq("id", g.id);
          console.log("[RECONCILE] Marked expired:", g.id, "txId:", g.transaction_id);
        }
        results.push({ id: g.id, status: bo.status || "pending" });
        continue;
      }
      const { data: grpOrders } = await sb
        .from("orders")
        .select("id, total, paid_total")
        .in("id", g.order_ids || []);
      const byId = new Map((grpOrders || []).map((o) => [o.id, o]));
      const orderedOrders = (g.order_ids || []).map((id) => byId.get(id)).filter(Boolean);
      if (orderedOrders.length === 0) {
        results.push({ id: g.id, status: "no-orders" });
        continue;
      }
      const shares = allocatePaymentShares(
        orderedOrders,
        Number(bo.amount || bo.base_amount || g.amount || 0)
      );
      let anyFresh = false;
      let anyError = false;
      for (let i = 0; i < orderedOrders.length; i++) {
        const r = await confirmOrder(sb, orderedOrders[i].id, g.transaction_id, bo, shares[i]);
        if (r.error) anyError = true;
        else if (r.confirmed && !r.already) anyFresh = true;
      }
      if (anyError) {
        results.push({ id: g.id, status: "error" });
        continue;
      }
      await sb.from("qris_payments").update({ status: "paid" }).eq("id", g.id);
      if (anyFresh) {
        const { data: finalOrders } = await sb
          .from("orders")
          .select("id, total, paid_total, customer_id")
          .in("id", g.order_ids || []);
        const info = await summarizeOrders(sb, finalOrders || []);
        const paidAmount = Number(bo.amount || bo.base_amount || g.amount || 0);
        await sendPushNotification(sb, {
          title: "QRIS Lunas",
          body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}${info.lines.length ? `\n${info.lines.join("\n")}` : ""}`,
          url: "/orders",
          type: "qris",
          orderIds: g.order_ids || [],
          amount: paidAmount,
        });
      }
      results.push({ id: g.id, status: "paid" });
    } catch (err) {
      results.push({ id: g.id, status: "error", error: err.message });
    }
  }
  return results;
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
      console.log("[WEBHOOK] Received:", event, "txId:", body.data?.transaction_id || body.transaction_id, "invoice:", body.data?.invoice_no || body.invoice_no);
      if (!verifyWebhook(rawBody, req.headers["x-boqris-signature"])) {
        console.log("[WEBHOOK] Signature FAILED. Header:", req.headers["x-boqris-signature"]?.slice(0, 20) + "...", "rawBody length:", rawBody.length);
        json(res, 401, { error: "Signature tidak valid" });
        return;
      }
      console.log("[WEBHOOK] Signature OK");
      if (event !== "payment.success") {
        console.log("[WEBHOOK] Ignoring event:", event);
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
        await sb.from("qris_payments").update({ status: "paid" }).eq("id", group.id);
        const { data: grpOrders } = await sb
          .from("orders")
          .select("id, total, paid_total")
          .in("id", group.order_ids);
        const byId = new Map((grpOrders || []).map((o) => [o.id, o]));
        const orderedOrders = group.order_ids
          .map((id) => byId.get(id))
          .filter(Boolean);
        const shares = allocatePaymentShares(
          orderedOrders,
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
        const fresh = results.filter((r) => r.confirmed && !r.already);
        if (fresh.length > 0) {
          const paidAmount = Number(bo.amount || bo.base_amount || 0);
          const { data: finalOrders } = await sb
            .from("orders")
            .select("id, total, paid_total, customer_id")
            .in("id", group.order_ids);
          const info = await summarizeOrders(sb, finalOrders || []);
          await sendPushNotification(sb, {
            title: "QRIS Lunas",
            body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}${info.lines.length ? `\n${info.lines.join("\n")}` : ""}`,
            url: "/orders",
            type: "qris",
            orderIds: group.order_ids,
            amount: paidAmount,
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
        const { data: finalOrder } = await sb
          .from("orders")
          .select("id, total, paid_total, customer_id")
          .eq("id", order.id)
          .single();
        const info = await summarizeOrders(sb, finalOrder ? [finalOrder] : [order]);
        const paidAmount = Number(bo.amount || bo.base_amount || 0);
        await sendPushNotification(sb, {
          title: "QRIS Lunas",
          body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}${info.lines.length ? `\n${info.lines.join("\n")}` : ""}`,
          url: `/orders/${order.id}`,
          type: "qris",
          orderIds: [order.id],
          amount: paidAmount,
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
        try {
          await sb.from("qris_payments").insert({
            id: "qg-" + randomUUID().replace(/-/g, "").slice(0, 22),
            order_ids: [order.id],
            amount: sisa,
            status: "pending",
            transaction_id: tx.transaction_id,
            requested_amount: sisa,
          });
        } catch {
          // riwayat tidak wajib; jangan gagalkan pembayaran
        }
        const info = await loadOrderInfo(sb, order);
        const qrSvg = await QRCode.toString(tx.qris_dynamic || tx.qr_url, { type: "svg", margin: 0, width: 200, color: { dark: "#ec4899", light: "#ffffff" } }).catch(() => null);
        json(res, 201, { order: info, tx: { ...tx, qr_svg: qrSvg } });
        return;
      }

      const groupId = "qg-" + randomUUID().replace(/-/g, "").slice(0, 22);
      const invoiceNo = groupId.slice(0, 25);
      const tx = await createBoqrisTransaction(sisaTotal, invoiceNo);
      const { error: groupErr } = await sb.from("qris_payments").insert({
        id: invoiceNo,
        order_ids: validOrders.map((o) => o.id),
        amount: sisaTotal,
        status: "pending",
        transaction_id: tx.transaction_id,
        requested_amount: sisaTotal,
      });
      if (groupErr) {
        json(res, 500, { error: "Gagal menyimpan pembayaran gabungan: " + groupErr.message });
        return;
      }

        const infoList = [];
      for (const order of validOrders) {
        infoList.push(await loadOrderInfo(sb, order));
      }

      const qrSvg = await QRCode.toString(tx.qris_dynamic || tx.qr_url, { type: "svg", margin: 0, width: 200, color: { dark: "#ec4899", light: "#ffffff" } }).catch(() => null);
      json(res, 201, {
        group: {
          id: invoiceNo,
          order_ids: validOrders.map((o) => o.id),
          sisa_total: sisaTotal,
        },
        orders: infoList,
        tx: { ...tx, qr_svg: qrSvg },
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
      const byId = new Map((confOrders || []).map((o) => [o.id, o]));
      const orderedOrders = orderIds
        .map((id) => byId.get(id))
        .filter(Boolean);
      const shares = allocatePaymentShares(
        orderedOrders,
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
        const { data: finalOrders } = await sb
          .from("orders")
          .select("id, total, paid_total, customer_id")
          .in("id", orderIds);
        const info = await summarizeOrders(sb, finalOrders || []);
        await sendPushNotification(sb, {
          title: "QRIS Lunas",
          body: `${rupiah(paidAmount)} diterima${info.names.length ? ` dari ${info.names.join(", ")}` : ""}${info.lines.length ? `\n${info.lines.join("\n")}` : ""}`,
          url: "/orders",
          type: "qris",
          orderIds,
          amount: paidAmount,
        });
      }
      json(res, 200, { status: "paid", confirmed: true, orders: results });
      return;
    }

    if (body.action === "reconcile") {
      const results = await reconcilePending(sb);
      json(res, 200, { processed: results.length, results });
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
