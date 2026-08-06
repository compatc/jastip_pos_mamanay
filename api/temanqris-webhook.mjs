import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

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

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

const UNIQUE_MAX = 999;

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

  // Hitung kode unik
  const sisaInvoice = (order.total || 0) - (order.paid_total || 0);
  const kodeUnik = Number(sisaInvoice) - Number(shareOfPayment);
  const isKodeUnik = Number(shareOfPayment) > 0 && kodeUnik > 0 && kodeUnik <= UNIQUE_MAX;

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

function verifyWebhook(rawBody, signatureHeader) {
  const secret = process.env.TEMANQRIS_WEBHOOK_SECRET || "b3343d1581a0e15cbe353e5f8f37e5ca9bf8bc938e7da8e42adddfb216af831b";
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

    // Verify webhook signature
    const signature = req.headers["x-signature"] || req.headers["x-temanqris-signature"];
    if (signature && !verifyWebhook(rawBody, signature)) {
      json(res, 401, { error: "Signature tidak valid" });
      return;
    }

    // TemanQRIS webhook payload
    const event = body.event || body.type || "";
    const data = body.data || body;

    if (event === "payment.success" || event === "paid" || data.status === "paid") {
      const orderId = data.order_id || "";
      const amount = data.amount || data.base_amount || 0;
      const payerName = data.payer_name || "";

      if (!orderId) {
        json(res, 400, { error: "order_id tidak ada" });
        return;
      }

      const sb = await getAdmin();
      const result = await confirmOrder(sb, orderId, amount, payerName);

      json(res, 200, result);
      return;
    }

    json(res, 200, { received: true });
  } catch (err) {
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
