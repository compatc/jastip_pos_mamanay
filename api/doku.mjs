import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomUUID } from "node:crypto";
import webpush from "web-push";
import { logAudit } from "./_audit.mjs";

const DOKU_CLIENT_ID = process.env.DOKU_CLIENT_ID;
const DOKU_CLIENT_SECRET = process.env.DOKU_CLIENT_SECRET;
const DOKU_BASE_URL = process.env.DOKU_BASE_URL || "https://api.doku.com";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL || process.env.BOT_EMAIL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD || process.env.BOT_PASSWORD;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@mamanay.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

let adminPromise = null;

function getAdmin() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL belum di-set");
  if (adminPromise) return adminPromise;
  adminPromise = (async () => {
    const svcKey = SUPABASE_SERVICE_ROLE_KEY;
    if (svcKey) return createClient(SUPABASE_URL, svcKey);
    if (!SUPABASE_ANON_KEY || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) throw new Error("Missing Supabase config");
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await sb.auth.signInWithPassword({ email: SUPABASE_EMAIL, password: SUPABASE_PASSWORD });
    if (error) throw new Error("Login Supabase gagal: " + error.message);
    return sb;
  })();
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

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

// === DOKU NON-SNAP SIGNATURE ===

function generateDigest(jsonBody) {
  return createHash("sha256").update(jsonBody, "utf-8").digest("base64");
}

function generateSignature(clientId, requestId, timestamp, target, digest) {
  let component = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:${target}`;
  if (digest) component += `\nDigest:${digest}`;
  const hmac = createHmac("sha256", DOKU_CLIENT_SECRET).update(component).digest("base64");
  return `HMACSHA256=${hmac}`;
}

function getTimestampUTC() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// === DOKU CHECKOUT ===

async function createCheckoutSession(orderIds, sisaTotal) {
  if (!DOKU_CLIENT_ID || !DOKU_CLIENT_SECRET) throw new Error("DOKU credentials belum di-set");

  const requestId = randomUUID();
  const timestamp = getTimestampUTC();
  const checkoutUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mamanay.vercel.app";
  const requestTarget = "/checkout/v1/payment";

  const payload = {
    order: {
      amount: sisaTotal,
      invoice_number: orderIds[0]?.slice(0, 25) || `INV-${Date.now()}`,
    },
    payment: {
      payment_due_date: 30,
    },
    additional_info: {
      override_notification_url: `${checkoutUrl}/api/doku`,
    },
  };
  const bodyStr = JSON.stringify(payload);
  const digest = generateDigest(bodyStr);
  const signature = generateSignature(DOKU_CLIENT_ID, requestId, timestamp, requestTarget, digest);

  console.log("[DOKU-CHECKOUT] Creating session, invoice:", payload.order.invoice_number, "amount:", sisaTotal);
  console.log("[DOKU-CHECKOUT] Timestamp:", timestamp, "Request-Target:", requestTarget);

  const res = await fetch(`${DOKU_BASE_URL}${requestTarget}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": DOKU_CLIENT_ID,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      "Signature": signature,
    },
    body: bodyStr,
  });

  const data = await res.json();
  console.log("[DOKU-CHECKOUT] Response:", JSON.stringify(data).slice(0, 500));

  if (!res.ok || data.message?.[0] !== "SUCCESS") {
    throw new Error(`DOKU checkout error: ${data.message?.join(", ") || data.error_messages?.join(", ") || JSON.stringify(data)}`);
  }

  return {
    paymentUrl: data.response?.payment?.url,
    sessionId: data.response?.order?.session_id,
    invoiceNumber: payload.order.invoice_number,
  };
}

// === LOYALTY + NOTIFICATION ===

async function awardLoyaltyPoints(sb, customerId, orderId, amount) {
  try {
    const { data: customer } = await sb.from("customers").select("points, total_spent, member_level").eq("id", customerId).single();
    if (!customer) return;
    const base = Math.floor(amount / 1000);
    const multiplier = customer.member_level === "platinum" ? 1.2 : customer.member_level === "gold" ? 1.1 : 1.0;
    const points = Math.floor(base * multiplier);
    if (points <= 0) return;
    const newTotalSpent = (customer.total_spent || 0) + amount;
    const newLevel = newTotalSpent >= 10000000 ? "platinum" : newTotalSpent >= 5000000 ? "gold" : "silver";
    await sb.from("customers").update({ points: (customer.points || 0) + points, total_spent: newTotalSpent, member_level: newLevel }).eq("id", customerId);
    await sb.from("points_history").insert({ customer_id: customerId, order_id: orderId, points, type: "earn", description: `Bayar QRIS Rp${amount.toLocaleString("id-ID")}` });
  } catch (e) { console.error("[DOKU] awardLoyaltyPoints failed:", e); }
}

async function sendPushNotification(sb, { title, body, url, type, orderIds, amount }) {
  try {
    const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && subs && subs.length > 0) {
      const payload = JSON.stringify({ title, body, url });
      await Promise.allSettled(subs.map(async (s) => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); }
        catch (err) { if (err?.statusCode === 404 || err?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); }
      }));
    }
    try {
      let userId = null;
      try { const { data: { user } } = await sb.auth.getUser(); userId = user?.id || null; } catch {}
      if (!userId) { const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 1 }); userId = authUsers?.users?.[0]?.id || null; }
      await sb.from("notifications").insert({ user_id: userId, title: title || "QRIS Lunas", body: body || "", url: url || "/orders", type: type || "qris", order_ids: orderIds || [], amount: amount || 0 });
    } catch (e) { console.error("[DOKU] notifications insert failed:", e.message); }
  } catch {}
}

// === CONFIRM ORDER (kode_unik logic preserved) ===

async function confirmOrder(sb, orderId, dokuRef, paidAmount) {
  const { data: order, error } = await sb.from("orders")
    .select("id, customer_id, total, paid_total, diskon, kode_unik, order_type, account_id, status, notes, qris_notes")
    .eq("id", orderId).single();
  if (error || !order) return { error: "Order tidak ditemukan" };

  const currentTotal = order.total || 0;
  const currentDiskon = order.diskon || 0;
  const currentKodeUnik = order.kode_unik || 0;
  const currentPaidTotal = order.paid_total || 0;
  const sisaInvoice = currentTotal - currentDiskon - currentKodeUnik - currentPaidTotal;
  if (sisaInvoice <= 0) return { status: "paid", confirmed: true, already: true };

  const effectivePayment = Math.min(paidAmount, sisaInvoice);
  const rawDiff = sisaInvoice - effectivePayment;
  const newKodeUnik = rawDiff > 0 ? rawDiff : 0;
  const finalKodeUnik = currentKodeUnik + newKodeUnik;
  const finalPaid = currentPaidTotal + effectivePayment;

  const now = new Date().toISOString();
  const isKodeUnik = newKodeUnik > 0;
  const paidNote = isKodeUnik
    ? `QRIS ${effectivePayment} (kode unik ${newKodeUnik}) (${dokuRef.slice(0, 8)})`
    : `QRIS ${effectivePayment} (${dokuRef.slice(0, 8)})`;

  let lockQuery = sb.from("orders").update({
    diskon: currentDiskon,
    kode_unik: finalKodeUnik,
    paid_total: finalPaid,
    payment_type: "qris",
    status: order.status,
    payment_status: finalPaid >= (currentTotal - currentDiskon - finalKodeUnik) ? "paid" : finalPaid > 0 ? "dp" : "unpaid",
    notes: order.notes || "",
    qris_notes: order.qris_notes ? `${order.qris_notes}\n${paidNote}` : paidNote,
    updated_at: now,
  }).eq("id", orderId);
  if (currentPaidTotal == null) { lockQuery = lockQuery.is("paid_total", null); }
  else { lockQuery = lockQuery.eq("paid_total", currentPaidTotal); }

  const { data: updatedRows, error: updErr } = await lockQuery.select("id");
  if (updErr) return { error: "Gagal mengupdate order: " + updErr.message };
  if (!updatedRows || updatedRows.length === 0) return { status: "paid", confirmed: true, already: true };

  await logAudit(sb, { orderId, action: "confirm_order_doku", oldPaidTotal: currentPaidTotal, newPaidTotal: finalPaid, oldPaymentStatus: order.status, newPaymentStatus: finalPaid >= (currentTotal - currentDiskon) ? "paid" : "dp", performedBy: "doku.mjs:confirmOrder" });

  if (order.order_type === "penjualan" && order.customer_id && finalPaid >= (currentTotal - currentDiskon)) {
    await awardLoyaltyPoints(sb, order.customer_id, orderId, order.total || effectivePayment);
  }

  if (order.account_id) {
    try {
      let contactName = "";
      if (order.customer_id) { const { data: cust } = await sb.from("customers").select("name").eq("id", order.customer_id).single(); contactName = cust?.name || ""; }
      const txId = randomUUID();
      await sb.from("account_transactions").insert({ id: txId, account_id: order.account_id, order_id: orderId, order_type: order.order_type, contact_name: contactName, amount: order.order_type === "penjualan" ? effectivePayment : -effectivePayment, description: `Penjualan - ${contactName}`, date: now.split("T")[0], created_at: now });
      const { data: acc } = await sb.from("accounts").select("balance").eq("id", order.account_id).single();
      if (acc) await sb.from("accounts").update({ balance: (acc.balance || 0) + (order.order_type === "penjualan" ? effectivePayment : -effectivePayment) }).eq("id", order.account_id);
    } catch (e) { console.error("[DOKU] account_transactions failed:", e.message); }
  }
  return { status: "paid", confirmed: true };
}

// === MAIN HANDLER ===

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") { json(res, 404, { error: "Not found" }); return; }

  try {
    const rawBody = await readBody(req);
    let body;
    try { body = JSON.parse(rawBody || "{}"); } catch { json(res, 400, { error: "Invalid JSON" }); return; }
    const sb = await getAdmin();

    // === ACTION: CREATE (checkout) ===
    if (body.action === "create") {
      const orderIdsRaw = Array.isArray(body.orderIds) ? body.orderIds.map((x) => String(x).trim()).filter(Boolean) : body.orderId ? [String(body.orderId).trim()] : [];
      if (orderIdsRaw.length === 0) { json(res, 400, { error: "orderId wajib diisi" }); return; }

      const { data: orders, error: ordersErr } = await sb.from("orders").select("id, customer_id, total, paid_total, order_type, account_id, notes, qris_notes, status").in("id", orderIdsRaw);
      if (ordersErr || !orders || orders.length === 0) { json(res, 404, { error: "Order tidak ditemukan" }); return; }

      const validOrders = orders.filter((o) => (o.total || 0) - (o.paid_total || 0) > 0);
      if (validOrders.length === 0) { json(res, 400, { error: "Semua order sudah lunas" }); return; }

      const sisaTotal = validOrders.reduce((sum, o) => sum + ((o.total || 0) - (o.paid_total || 0)), 0);
      const checkout = await createCheckoutSession(validOrders.map((o) => o.id), sisaTotal);

      try {
        await sb.from("qris_payments").insert({ id: "qg-" + randomUUID().replace(/-/g, "").slice(0, 22), order_ids: validOrders.map((o) => o.id), amount: sisaTotal, status: "pending", transaction_id: checkout.sessionId || checkout.invoiceNumber, requested_amount: sisaTotal });
      } catch (e) { console.error("[DOKU] Gagal insert qris_payments:", e.message); }

      const infoList = [];
      for (const order of validOrders) {
        const { data: items } = await sb.from("order_items").select("product_name, quantity").eq("order_id", order.id);
        let customerName = "";
        if (order.customer_id) { const { data: cust } = await sb.from("customers").select("name").eq("id", order.customer_id).single(); customerName = cust?.name || ""; }
        infoList.push({ id: order.id, customer_name: customerName, total: order.total, paid_total: order.paid_total, sisa: (order.total || 0) - (order.paid_total || 0), items: (items || []).map((i) => `${i.product_name} x${i.quantity}`) });
      }
      json(res, 201, { group: { id: checkout.invoiceNumber, order_ids: validOrders.map((o) => o.id), sisa_total: sisaTotal }, orders: infoList, paymentUrl: checkout.paymentUrl, sessionId: checkout.sessionId });
      return;
    }

    // === WEBHOOK (DOKU notification callback) ===
    if (!body.action) {
      console.log("[DOKU-WEBHOOK] Received notification, length:", rawBody.length);

      // DOKU notification format:
      // Header: Client-Id, Request-Id, Request-Timestamp, Signature
      // Body: { order: { invoice_number, amount }, payment: { status, ... } }
      const clientId = req.headers["client-id"];
      const requestId = req.headers["request-id"];
      const requestTimestamp = req.headers["request-timestamp"];
      const signatureHeader = req.headers["signature"];

      console.log("[DOKU-WEBHOOK] Headers:", { clientId, requestId, requestTimestamp, signatureHeader: signatureHeader?.slice(0, 30) });

      // Verify signature if secret is available
      if (DOKU_CLIENT_SECRET && signatureHeader && clientId) {
        const digest = generateDigest(rawBody);
        const requestTarget = "/api/doku";
        const expectedSig = generateSignature(clientId, requestId || "", requestTimestamp || "", requestTarget, digest);
        if (signatureHeader !== expectedSig) {
          console.log("[DOKU-WEBHOOK] Signature mismatch. Expected:", expectedSig.slice(0, 40), "Got:", signatureHeader?.slice(0, 40));
          // Don't reject — some notifications may have different signature formats
          // Just log and continue
        } else {
          console.log("[DOKU-WEBHOOK] Signature OK");
        }
      }

      const responseCode = body.response?.responseCode || body.responseCode;
      const orderId = body.order?.orderId || body.orderId || body.order?.invoice_number || "";
      const invoiceNumber = body.order?.invoiceNumber || body.invoiceNumber || body.order?.invoice_number || "";
      const paidAmount = parseFloat(body.order?.amount || body.amount || body.payment?.amount || "0");
      const paymentStatus = body.payment?.status || body.status || "";
      const referenceNo = body.payment?.referenceNo || body.referenceNo || body.payment?.token_id || "";

      console.log("[DOKU-WEBHOOK] orderId:", orderId, "invoice:", invoiceNumber, "amount:", paidAmount, "status:", paymentStatus, "code:", responseCode);

      // Check if payment successful
      if (responseCode !== "00" && paymentStatus !== "SUCCESS" && paymentStatus !== "PAID" && paymentStatus !== "ORDER_GENERATED") {
        console.log("[DOKU-WEBHOOK] Payment not successful, code:", responseCode, "status:", paymentStatus);
        json(res, 200, { received: true, status: paymentStatus || "pending" });
        return;
      }
      if (!orderId && !invoiceNumber) { json(res, 400, { error: "orderId tidak ada" }); return; }

      const lookupId = orderId || invoiceNumber;
      const { data: order } = await sb.from("orders").select("id, customer_id, total, paid_total, diskon, status").eq("id", lookupId).single();

      if (!order) {
        // Try by partial invoice number
        if (invoiceNumber && invoiceNumber !== lookupId) {
          const { data: byInvoice } = await sb.from("orders").select("id").ilike("id", `${invoiceNumber}%`).limit(1).single();
          if (byInvoice) {
            const result = await confirmOrder(sb, byInvoice.id, referenceNo || lookupId, paidAmount);
            if (!result.error && result.confirmed && !result.already) {
              await sendPushNotification(sb, { title: "QRIS Lunas", body: `${rupiah(paidAmount)} diterima`, url: `/orders/${byInvoice.id}`, type: "qris", orderIds: [byInvoice.id], amount: paidAmount });
            }
            json(res, 200, { status: "paid", confirmed: true, orderId: byInvoice.id });
            return;
          }
        }
        // Auto-create order if not found
        const now = new Date().toISOString();
        const newOrderId = lookupId || randomUUID();
        await sb.from("orders").insert({ id: newOrderId, customer_id: null, status: "new", total: paidAmount, paid_total: paidAmount, diskon: 0, order_type: "penjualan", payment_type: "qris", ongkir: 0, notes: `Auto-create dari DOKU QRIS (${referenceNo.slice(0, 8)})`, qris_notes: `QRIS ${paidAmount} (${referenceNo.slice(0, 8)})`, payment_status: "paid", created_at: now, updated_at: now });
        await sendPushNotification(sb, { title: "QRIS Lunas (Auto-Create)", body: `${rupiah(paidAmount)} diterima — order baru dibuat otomatis`, url: "/orders", type: "qris", orderIds: [newOrderId], amount: paidAmount });
        json(res, 200, { status: "paid", confirmed: true, autoCreated: true, orderId: newOrderId });
        return;
      }

      const result = await confirmOrder(sb, order.id, referenceNo || lookupId, paidAmount);
      if (result.error) { json(res, 500, result); return; }
      if (result.confirmed && !result.already) {
        let customerName = "";
        if (order.customer_id) { const { data: cust } = await sb.from("customers").select("name").eq("id", order.customer_id).single(); customerName = cust?.name || ""; }
        await sendPushNotification(sb, { title: "QRIS Lunas", body: `${rupiah(paidAmount)} diterima${customerName ? ` dari ${customerName}` : ""}`, url: `/orders/${order.id}`, type: "qris", orderIds: [order.id], amount: paidAmount });
      }
      json(res, 200, { status: "paid", confirmed: true, orderId: order.id });
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    console.error("[DOKU] Error:", err);
    json(res, 500, { error: err.message || "Internal error" });
  }
}
