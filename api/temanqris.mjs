import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import QRCode from "qrcode";

const TEMANQRIS_BASE = "https://temanqris.com/api/qris";
const UNIQUE_MAX = 999; // Kode unik 1-999

// Generate kode unik (1-999)
function generateUniqueCode() {
  return Math.floor(Math.random() * UNIQUE_MAX) + 1;
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

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

// ============================================================
// TemanQRIS API Functions
// ============================================================

async function temanqrisApi(path, options = {}) {
  const apiKey = process.env.TEMANQRIS_API_KEY;
  if (!apiKey) throw new Error("TEMANQRIS_API_KEY belum di-set di Vercel");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${TEMANQRIS_BASE}${path}`, {
      ...options,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || `TemanQRIS ${res.status}`);
    }
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("TemanQRIS API timeout, coba lagi nanti");
    }
    throw err;
  }
}

// Upload QRIS statis (sekali saja)
async function uploadQrisStatic(qrisString) {
  return temanqrisApi("/upload", {
    method: "POST",
    body: JSON.stringify({ qris_string: qrisString }),
  });
}

// Cek apakah sudah upload QRIS statis
async function checkMyQris() {
  return temanqrisApi("/my-qris");
}

// Generate QRIS dinamis dengan kode unik
async function generateDynamicQris(amount, description, orderId) {
  const webhookUrl = process.env.WEBHOOK_URL || "https://mamanay.vercel.app/api/temanqris-webhook";
  const callbackUrl = "https://mamanay.vercel.app/callback.html";

  // Generate kode unik (1-999)
  const uniqueCode = generateUniqueCode();
  const finalAmount = amount + uniqueCode;

  // Generate short unique ID (max 30 char) - pastikan unik
  const sb = await getAdmin();
  let shortOrderId;
  let exists = true;
  while (exists) {
    shortOrderId = "ORD-" + randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const { data } = await sb.from("qris_payments").select("id").eq("id", shortOrderId).single();
    exists = !!data;
  }

  const result = await temanqrisApi("/payment-link", {
    method: "POST",
    body: JSON.stringify({
      amount: finalAmount,
      description: description || `Pembayaran order ${shortOrderId}`,
      order_id: shortOrderId,
      webhook_url: webhookUrl,
      callback_url: callbackUrl,
      webhook_secret: process.env.TEMANQRIS_WEBHOOK_SECRET || "b3343d1581a0e15cbe353e5f8f37e5ca9bf8bc938e7da8e42adddfb216af831b",
    }),
  });

  // Simpan mapping short_order_id → order_id asli di qris_payments
  try {
    await sb.from("qris_payments").insert({
      id: shortOrderId,
      order_ids: [orderId],
      amount: finalAmount,
      status: "pending",
      requested_amount: finalAmount,
    });
  } catch (e) {
    // ignore error
  }

  // Return dengan info kode unik
  return {
    ...result,
    unique_code: uniqueCode,
    original_amount: amount,
    final_amount: finalAmount,
    short_order_id: shortOrderId,
  };
}

// Cek status order
async function checkOrderStatus(orderId) {
  return temanqrisApi(`/orders/${orderId}`);
}

// Verify order (setelah admin konfirmasi dana masuk)
async function verifyOrder(orderId, payerName) {
  return temanqrisApi(`/orders/${orderId}/verify`, {
    method: "POST",
    body: JSON.stringify({
      payer_name: payerName || "Manual Verify",
      payer_note: "Dana sudah masuk ke rekening merchant",
    }),
  });
}

// ============================================================
// Confirm Order (sama seperti pay.mjs)
// ============================================================

async function confirmOrder(sb, orderId, amount, payerName) {
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

  const shareOfPayment = Number(amount || 0);
  if (!(shareOfPayment > 0)) {
    return { status: "paid", confirmed: true, already: true };
  }

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

  // Hitung kode unik (selisih antara yang dibayar dan sisa tagihan)
  const sisaInvoice = (order.total || 0) - (order.paid_total || 0);
  const kodeUnik = Number(sisaInvoice) - Number(shareOfPayment);
  const isKodeUnik = Number(shareOfPayment) > 0 && kodeUnik > 0 && kodeUnik <= UNIQUE_MAX;

  // Final values
  const finalTotal = isKodeUnik ? (order.total || 0) - kodeUnik : (order.total || 0);
  const finalDiskon = isKodeUnik ? (order.diskon || 0) + kodeUnik : (order.diskon || 0);
  const finalPaid = (order.paid_total || 0) + shareOfPayment;

  const paidNote = isKodeUnik
    ? `QRIS ${shareOfPayment} (kode unik ${kodeUnik}) - ${payerName || "TemanQRIS"} - ${now}`
    : `QRIS ${shareOfPayment} (${payerName || "TemanQRIS"}) - ${now}`;

  let lockQuery = sb.from("orders").update({
    total: finalTotal,
    diskon: finalDiskon,
    paid_total: finalPaid,
    payment_type: "qris",
    status: newStatus,
    notes: order.notes ? `${order.notes}\n${paidNote}` : paidNote,
    updated_at: now,
  }).eq("id", orderId);

  if (order.paid_total == null) {
    lockQuery = lockQuery.is("paid_total", null);
  } else {
    lockQuery = lockQuery.eq("paid_total", order.paid_total);
  }

  const { data: updatedRows, error: updErr } = await lockQuery.select("id");
  if (updErr) {
    return { error: "Gagal mengupdate order: " + updErr.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { status: "paid", confirmed: true, already: true };
  }

  // Update account balance
  if (order.account_id) {
    const { data: acc } = await sb
      .from("accounts")
      .select("balance")
      .eq("id", order.account_id)
      .single();
    if (acc) {
      await sb
        .from("accounts")
        .update({ balance: (acc.balance || 0) + shareOfPayment })
        .eq("id", order.account_id);
    }
  }

  return { status: "paid", confirmed: true, kode_unik: isKodeUnik ? kodeUnik : 0 };
}

// ============================================================
// Handler
// ============================================================

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

    // Action: generate QRIS dinamis
    if (body.action === "generate") {
      const { amount, orderId, description } = body;
      if (!amount || amount <= 0) {
        json(res, 400, { error: "amount wajib diisi" });
        return;
      }

      const result = await generateDynamicQris(amount, description, orderId);

      json(res, 201, {
        success: true,
        payment_link: result.payment_link || result.url,
        qr_image: result.qr_image,
        order_id: orderId,
        amount,
      });
      return;
    }

    // Action: check order status
    if (body.action === "status") {
      const { orderId } = body;
      if (!orderId) {
        json(res, 400, { error: "orderId wajib diisi" });
        return;
      }

      const result = await checkOrderStatus(orderId);
      json(res, 200, result);
      return;
    }

    // Action: verify order (manual confirm)
    if (body.action === "verify") {
      const { orderId, amount, payerName } = body;
      if (!orderId) {
        json(res, 400, { error: "orderId wajib diisi" });
        return;
      }

      // Cari order dengan id yang di-truncate (startsWith)
      const { data: orders, error: searchErr } = await sb
        .from("orders")
        .select("id")
        .ilike("id", `${String(orderId).slice(0, 30)}%`)
        .limit(1);

      if (searchErr || !orders || orders.length === 0) {
        json(res, 404, { error: "Order tidak ditemukan" });
        return;
      }

      const result = await confirmOrder(sb, orders[0].id, amount, payerName);
      json(res, 200, result);
      return;
    }

    // Action: check my QRIS
    if (body.action === "my-qris") {
      const result = await checkMyQris();
      json(res, 200, result);
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
