import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import QRCode from "qrcode";

const TEMANQRIS_BASE = "https://temanqris.com/api/qris";
const UNIQUE_MAX = 200; // Kode unik 1-200

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

// Generate QRIS dinamis
async function generateDynamicQris(sb, amount, description, orderId) {
  const webhookUrl = process.env.WEBHOOK_URL || "https://mamanay.vercel.app/api/temanqris-webhook";
  const callbackUrl = "https://mamanay.vercel.app/callback.html";

  const shortOrderId = "ORD-" + randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  // Kode unik 1-200
  const kodeUnik = Math.floor(Math.random() * 200) + 1;
  const qrAmount = amount + kodeUnik;

  const result = await temanqrisApi("/generate", {
    method: "POST",
    body: JSON.stringify({
      amount: qrAmount,
      order_id: shortOrderId,
      webhook_url: webhookUrl,
      callback_url: callbackUrl,
    }),
  });

  // Generate QR SVG dari qris string kalau qr_image kosong
  let qrSvg = result.qr_image || null;
  if (!qrSvg && result.qris) {
    try {
      const QRCode = await import("qrcode");
      const svgStr = await QRCode.toString(result.qris, {
        type: "svg",
        margin: 2,
        width: 200,
      });
      qrSvg = "data:image/svg+xml;base64," + Buffer.from(svgStr).toString("base64");
    } catch (e) {
      console.error("[TemanQRIS] QR gen error:", e.message);
    }
  }

  // Payment link
  const linkCode = result.payment_link?.link_code || "";
  const paymentLink = linkCode ? `https://temanqris.com/p/${linkCode}` : "";

  // Simpan mapping
  try {
    await sb.from("order_qris_map").insert({
      short_id: shortOrderId,
      order_id: orderId,
      amount: qrAmount,
    });
  } catch (e) {}

  return {
    qr_image: qrSvg,
    payment_link: paymentLink,
    qris: result.qris || null,
    amount: qrAmount,
    original_amount: amount,
    kode_unik: kodeUnik,
    short_order_id: shortOrderId,
  };
}

// Cek status order dari Supabase + TemanQRIS
async function checkOrderStatus(sb, orderId) {
  const { data: order, error } = await sb
    .from("orders")
    .select("id, total, paid_total, status, customer_id, diskon, order_type, account_id, notes")
    .eq("id", orderId)
    .single();
  if (error || !order) return { error: "Order tidak ditemukan" };

  const supabaseStatus = {
    id: order.id,
    total: order.total,
    paid_total: order.paid_total || 0,
    sisa: (order.total || 0) - (order.paid_total || 0),
    status: order.status,
  };

  if ((order.paid_total || 0) >= (order.total || 0) || order.status === "paid") {
    return supabaseStatus;
  }

  try {
    const { data: mappings } = await sb
      .from("order_qris_map")
      .select("short_id, amount")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (mappings && mappings.length > 0) {
      const shortId = mappings[0].short_id;
      const temanResult = await temanqrisApi(`/orders/${shortId}`);
      const temanOrder = temanResult.order || temanResult;

      if (temanOrder.status === "paid" || temanOrder.is_paid) {
        const payerName = temanOrder.payer_name || "";
        const amount = temanOrder.amount || mappings[0].amount;
        await confirmOrder(sb, orderId, amount, payerName);

        const { data: updated } = await sb
          .from("orders")
          .select("id, total, paid_total, status")
          .eq("id", orderId)
          .single();
        if (updated) {
          return {
            id: updated.id,
            total: updated.total,
            paid_total: updated.paid_total || 0,
            sisa: (updated.total || 0) - (updated.paid_total || 0),
            status: updated.status,
            paid_via_polling: true,
          };
        }
      }
    }
  } catch (e) {
    console.error("[TemanQRIS] Polling error:", e.message);
  }

  return supabaseStatus;
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

  // Hitung kode unik: customer bayar lebih → selisih jadi diskon
  const sisaInvoice = (order.total || 0) - (order.paid_total || 0);
  const kodeUnik = Number(shareOfPayment) - Number(sisaInvoice);
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

      try {
        const result = await generateDynamicQris(sb, amount, description, orderId);

        json(res, 201, {
          success: true,
          payment_link: `https://temanqris.com${result.payment_link?.url || ""}`,
          qr_image: result.qr_image || null,
          qris: result.qris || null,
          order_id: orderId,
          amount: result.amount,
          original_amount: result.original_amount,
          kode_unik: result.kode_unik,
        });
      } catch (err) {
        console.error("[TemanQRIS] Generate error:", err.message);
        json(res, 500, { error: err.message });
      }
      return;
    }

    // Action: check order status
    if (body.action === "status") {
      const { orderId } = body;
      if (!orderId) {
        json(res, 400, { error: "orderId wajib diisi" });
        return;
      }

      const result = await checkOrderStatus(sb, orderId);
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
