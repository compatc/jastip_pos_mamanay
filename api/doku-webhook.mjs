import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import webpush from "web-push";
import { logAudit } from "./_audit.mjs";

const DOKU_CLIENT_SECRET = process.env.DOKU_CLIENT_SECRET;
const DOKU_CLIENT_ID = process.env.DOKU_CLIENT_ID;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@mamanay.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function getAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase config");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

function verifyDokuSignature(rawBody, signatureHeader) {
  if (!DOKU_CLIENT_SECRET) {
    console.error("[DOKU-WEBHOOK] DOKU_CLIENT_SECRET tidak di-set");
    return false;
  }
  try {
    const parsed = JSON.parse(rawBody);
    const payloadStr = JSON.stringify(parsed);
    const hash = createHmac("sha256", DOKU_CLIENT_SECRET).update(payloadStr).digest("hex");
    const expected = hash;
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader || "", "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (e) {
    console.error("[DOKU-WEBHOOK] Signature verify error:", e.message);
    return false;
  }
}

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

async function awardLoyaltyPoints(sb, customerId, orderId, amount) {
  try {
    const { data: customer } = await sb
      .from("customers")
      .select("points, total_spent, member_level")
      .eq("id", customerId)
      .single();
    if (!customer) return;

    const base = Math.floor(amount / 1000);
    const multiplier = customer.member_level === "platinum" ? 1.2 : customer.member_level === "gold" ? 1.1 : 1.0;
    const points = Math.floor(base * multiplier);
    if (points <= 0) return;

    const newTotalSpent = (customer.total_spent || 0) + amount;
    const newLevel = newTotalSpent >= 10000000 ? "platinum" : newTotalSpent >= 5000000 ? "gold" : "silver";
    const newPoints = (customer.points || 0) + points;

    await sb.from("customers").update({
      points: newPoints,
      total_spent: newTotalSpent,
      member_level: newLevel,
    }).eq("id", customerId);

    await sb.from("points_history").insert({
      customer_id: customerId,
      order_id: orderId,
      points,
      type: "earn",
      description: `Bayar QRIS Rp${amount.toLocaleString("id-ID")}`,
    });
  } catch (e) {
    console.error("[DOKU-WEBHOOK] awardLoyaltyPoints failed:", e);
  }
}

async function sendPushNotification(sb, { title, body, url, type, orderIds, amount }) {
  try {
    const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && subs && subs.length > 0) {
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
      let userId = null;
      try {
        const { data: { user } } = await sb.auth.getUser();
        userId = user?.id || null;
      } catch {}
      if (!userId) {
        const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 1 });
        userId = authUsers?.users?.[0]?.id || null;
      }
      await sb.from("notifications").insert({
        user_id: userId,
        title: title || "QRIS Lunas",
        body: body || "",
        url: url || "/orders",
        type: type || "qris",
        order_ids: orderIds || [],
        amount: amount || 0,
      });
    } catch (e) {
      console.error("[DOKU-WEBHOOK] notifications insert failed:", e.message);
    }
  } catch {}
}

async function confirmOrder(sb, orderId, dokuRef, paidAmount) {
  const { data: order, error } = await sb
    .from("orders")
    .select("id, customer_id, total, paid_total, diskon, kode_unik, order_type, account_id, status, notes, qris_notes")
    .eq("id", orderId)
    .single();
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

  if (currentPaidTotal == null) {
    lockQuery = lockQuery.is("paid_total", null);
  } else {
    lockQuery = lockQuery.eq("paid_total", currentPaidTotal);
  }

  const { data: updatedRows, error: updErr } = await lockQuery.select("id");
  if (updErr) return { error: "Gagal mengupdate order: " + updErr.message };
  if (!updatedRows || updatedRows.length === 0) return { status: "paid", confirmed: true, already: true };

  await logAudit(sb, {
    orderId,
    action: "confirm_order_doku",
    oldPaidTotal: currentPaidTotal,
    newPaidTotal: finalPaid,
    oldPaymentStatus: order.status,
    newPaymentStatus: finalPaid >= (currentTotal - currentDiskon) ? "paid" : "dp",
    performedBy: "doku-webhook.mjs:confirmOrder"
  });

  if (order.order_type === "penjualan" && order.customer_id && finalPaid >= (currentTotal - currentDiskon)) {
    await awardLoyaltyPoints(sb, order.customer_id, orderId, order.total || effectivePayment);
  }

  if (order.account_id) {
    try {
      let contactName = "";
      if (order.customer_id) {
        const { data: cust } = await sb.from("customers").select("name").eq("id", order.customer_id).single();
        contactName = cust?.name || "";
      }
      const txId = randomUUID();
      await sb.from("account_transactions").insert({
        id: txId,
        account_id: order.account_id,
        order_id: orderId,
        order_type: order.order_type,
        contact_name: contactName,
        amount: order.order_type === "penjualan" ? effectivePayment : -effectivePayment,
        description: `Penjualan - ${contactName}`,
        date: now.split("T")[0],
        created_at: now,
      });
      const { data: acc } = await sb.from("accounts").select("balance").eq("id", order.account_id).single();
      if (acc) {
        await sb.from("accounts").update({
          balance: (acc.balance || 0) + (order.order_type === "penjualan" ? effectivePayment : -effectivePayment)
        }).eq("id", order.account_id);
      }
    } catch (e) {
      console.error("[DOKU-WEBHOOK] account_transactions failed:", e.message);
    }
  }

  return { status: "paid", confirmed: true };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") { json(res, 404, { error: "Not found" }); return; }

  try {
    const rawBody = await readBody(req);
    console.log("[DOKU-WEBHOOK] Received, length:", rawBody.length);

    let body;
    try { body = JSON.parse(rawBody || "{}"); } catch { json(res, 400, { error: "Invalid JSON" }); return; }

    const sb = getAdmin();

    // DOKU webhook signature verification
    const signature = req.headers["x-signature"] || req.headers["x-doku-signature"];
    if (DOKU_CLIENT_SECRET && signature) {
      if (!verifyDokuSignature(rawBody, signature)) {
        console.log("[DOKU-WEBHOOK] Signature FAILED");
        json(res, 401, { error: "Signature tidak valid" });
        return;
      }
      console.log("[DOKU-WEBHOOK] Signature OK");
    } else {
      console.log("[DOKU-WEBHOOK] No signature verification (DOKU_CLIENT_SECRET atau signature header tidak ada)");
    }

    // DOKU Checkout webhook format
    // {
    //   "header": { "clientId": "...", "requestId": "...", "timestamp": "..." },
    //   "response": { "responseCode": "00", "responseMessage": "Success" },
    //   "order": { "orderId": "...", "invoiceNumber": "...", "amount": "10000.00" },
    //   "payment": { "referenceNo": "...", "paymentMethod": "QRIS", "status": "SUCCESS" }
    // }

    const responseCode = body.response?.responseCode || body.responseCode;
    const orderId = body.order?.orderId || body.orderId || "";
    const invoiceNumber = body.order?.invoiceNumber || body.invoiceNumber || "";
    const paidAmount = parseFloat(body.order?.amount || body.amount || body.payment?.amount || "0");
    const paymentStatus = body.payment?.status || body.status || "";
    const referenceNo = body.payment?.referenceNo || body.referenceNo || "";
    const paymentMethod = body.payment?.paymentMethod || body.paymentMethod || "";

    console.log("[DOKU-WEBHOOK] orderId:", orderId, "invoice:", invoiceNumber, "amount:", paidAmount, "status:", paymentStatus, "code:", responseCode);

    // Check if payment successful
    if (responseCode !== "00" && paymentStatus !== "SUCCESS" && paymentStatus !== "PAID") {
      console.log("[DOKU-WEBHOOK] Payment not successful, code:", responseCode, "status:", paymentStatus);
      json(res, 200, { received: true, status: paymentStatus || "pending" });
      return;
    }

    if (!orderId) {
      json(res, 400, { error: "orderId tidak ada" });
      return;
    }

    // Find order
    const { data: order } = await sb
      .from("orders")
      .select("id, customer_id, total, paid_total, diskon, status")
      .eq("id", orderId)
      .single();

    if (!order) {
      console.log("[DOKU-WEBHOOK] Order not found:", orderId);
      // Try by invoice number
      if (invoiceNumber) {
        const { data: byInvoice } = await sb
          .from("orders")
          .select("id")
          .ilike("id", `${invoiceNumber}%`)
          .limit(1)
          .single();
        if (byInvoice) {
          const result = await confirmOrder(sb, byInvoice.id, referenceNo || orderId, paidAmount);
          if (!result.error && result.confirmed && !result.already) {
            const { data: finalOrder } = await sb.from("orders").select("id, total, paid_total, customer_id").eq("id", byInvoice.id).single();
            await sendPushNotification(sb, {
              title: "QRIS Lunas",
              body: `${rupiah(paidAmount)} diterima`,
              url: `/orders/${byInvoice.id}`,
              type: "qris",
              orderIds: [byInvoice.id],
              amount: paidAmount,
            });
          }
          json(res, 200, { status: "paid", confirmed: true, orderId: byInvoice.id });
          return;
        }
      }
      // Auto-create order if not found
      const now = new Date().toISOString();
      const newOrderId = orderId || randomUUID();
      await sb.from("orders").insert({
        id: newOrderId,
        customer_id: null,
        status: "new",
        total: paidAmount,
        paid_total: paidAmount,
        diskon: 0,
        order_type: "penjualan",
        payment_type: "qris",
        ongkir: 0,
        notes: `Auto-create dari DOKU QRIS (${referenceNo.slice(0, 8)})`,
        qris_notes: `QRIS ${paidAmount} (${referenceNo.slice(0, 8)})`,
        payment_status: "paid",
        created_at: now,
        updated_at: now,
      });
      await sendPushNotification(sb, {
        title: "QRIS Lunas (Auto-Create)",
        body: `${rupiah(paidAmount)} diterima — order baru dibuat otomatis`,
        url: "/orders",
        type: "qris",
        orderIds: [newOrderId],
        amount: paidAmount,
      });
      json(res, 200, { status: "paid", confirmed: true, autoCreated: true, orderId: newOrderId });
      return;
    }

    const result = await confirmOrder(sb, orderId, referenceNo || orderId, paidAmount);
    if (result.error) { json(res, 500, result); return; }

    if (result.confirmed && !result.already) {
      const { data: finalOrder } = await sb
        .from("orders").select("id, total, paid_total, customer_id").eq("id", orderId).single();
      let customerName = "";
      if (finalOrder?.customer_id) {
        const { data: cust } = await sb.from("customers").select("name").eq("id", finalOrder.customer_id).single();
        customerName = cust?.name || "";
      }
      await sendPushNotification(sb, {
        title: "QRIS Lunas",
        body: `${rupiah(paidAmount)} diterima${customerName ? ` dari ${customerName}` : ""}`,
        url: `/orders/${orderId}`,
        type: "qris",
        orderIds: [orderId],
        amount: paidAmount,
      });
    }

    json(res, 200, { status: "paid", confirmed: true, orderId });
  } catch (err) {
    console.error("[DOKU-WEBHOOK] Error:", err);
    json(res, 500, { error: err.message || "Internal error" });
  }
}
