import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import QRCode from "qrcode";

const DOKU_CLIENT_ID = process.env.DOKU_CLIENT_ID;
const DOKU_CLIENT_SECRET = process.env.DOKU_CLIENT_SECRET;
const DOKU_API_KEY = process.env.DOKU_API_KEY;
const DOKU_BASE_URL = process.env.DOKU_BASE_URL || "https://api-sandbox.doku.com";
const DOKU_CHECKOUT_URL = process.env.DOKU_CHECKOUT_URL || "https://sandbox.doku.com";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL || process.env.BOT_EMAIL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD || process.env.BOT_PASSWORD;

let adminPromise = null;
let adminIsServiceRole = false;

function getAdmin() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL belum di-set");
  if (adminPromise) return adminPromise;
  adminPromise = (async () => {
    const svcKey = SUPABASE_SERVICE_ROLE_KEY;
    if (svcKey) { adminIsServiceRole = true; return createClient(SUPABASE_URL, svcKey); }
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

function generateSignature(method, path, accessToken, bodyStr, timestamp) {
  if (!DOKU_CLIENT_SECRET) throw new Error("DOKU_CLIENT_SECRET belum di-set");
  const bodyHash = createHmac("sha256", "").update(bodyStr).digest("hex");
  const stringToSign = `${method}:${path}:${timestamp}:${bodyHash}`;
  return createHmac("sha256", DOKU_CLIENT_SECRET).update(stringToSign).digest("hex");
}

function generateTokenSign(timestamp) {
  if (!DOKU_CLIENT_SECRET) throw new Error("DOKU_CLIENT_SECRET belum di-set");
  const stringToSign = `clientid:${DOKU_CLIENT_ID}:${timestamp}`;
  return createHmac("sha256", DOKU_CLIENT_SECRET).update(stringToSign).digest("hex");
}

async function getAccessToken() {
  if (!DOKU_CLIENT_ID) throw new Error("DOKU_CLIENT_ID belum di-set");

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "") + "+07:00";
  const signature = generateTokenSign(timestamp);

  const res = await fetch(`${DOKU_BASE_URL}/snap/v1.0/access-token/b2b`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CLIENT-KEY": DOKU_CLIENT_ID,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": signature,
    },
  });

  const data = await res.json();
  if (data.responseCode !== "00" || !data.accessToken) {
    throw new Error(`DOKU token error: ${data.responseMessage || JSON.stringify(data)}`);
  }
  return data.accessToken;
}

async function createCheckoutSession(orderIds, sisaTotal) {
  const accessToken = await getAccessToken();
  const requestId = randomUUID();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "") + "+07:00";

  const checkoutUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mamanay.vercel.app";

  const payload = {
    order: {
      invoiceNumber: orderIds[0]?.slice(0, 25) || `INV-${Date.now()}`,
      lineItems: [{
        id: "item-1",
        name: `${orderIds.length > 1 ? `${orderIds.length} orders` : "Order"} - Jastip Mamanay`,
        price: sisaTotal,
        quantity: 1,
        groupId: "group-1",
      }],
      amount: sisaTotal,
      currency: "IDR",
      callbackUrl: checkoutUrl,
      expiryTime: 3600,
    },
    payment: {
      paymentMethods: ["QRIS"],
      callbackUrl: `${checkoutUrl}/api/doku-webhook`,
      returnUrl: `${checkoutUrl}/orders`,
    },
  };

  const bodyStr = JSON.stringify(payload);
  const bodyHash = createHmac("sha256", DOKU_CLIENT_SECRET).update(bodyStr).digest("hex");
  const stringToSign = `POST:/checkout/v1/payment:${timestamp}:${bodyHash}`;
  const signature = createHmac("sha256", DOKU_CLIENT_SECRET).update(stringToSign).digest("hex");

  const res = await fetch(`${DOKU_BASE_URL}/checkout/v1/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "client-id": DOKU_CLIENT_ID,
      "request-id": requestId,
      "request-timestamp": timestamp,
      "X-SIGNATURE": signature,
      "Authorization": `Bearer ${accessToken}`,
    },
    body: bodyStr,
  });

  const data = await res.json();
  if (data.response?.responseCode !== "00" && !data.payment?.url) {
    throw new Error(`DOKU checkout error: ${data.response?.responseMessage || JSON.stringify(data)}`);
  }
  return {
    paymentUrl: data.payment?.url,
    accessToken: data.payment?.accessToken,
    referenceNo: data.payment?.referenceNo,
    orderId: payload.order.invoiceNumber,
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") { json(res, 404, { error: "Not found" }); return; }

  try {
    const rawBody = await readBody(req);
    let body;
    try { body = JSON.parse(rawBody || "{}"); } catch { json(res, 400, { error: "Invalid JSON" }); return; }

    const action = body.action || "create";

    if (action === "create") {
      const orderIdsRaw = Array.isArray(body.orderIds)
        ? body.orderIds.map((x) => String(x).trim()).filter(Boolean)
        : body.orderId ? [String(body.orderId).trim()] : [];
      if (orderIdsRaw.length === 0) { json(res, 400, { error: "orderId wajib diisi" }); return; }

      const sb = await getAdmin();
      const { data: orders, error: ordersErr } = await sb
        .from("orders")
        .select("id, customer_id, total, paid_total, order_type, account_id, notes, qris_notes, status")
        .in("id", orderIdsRaw);
      if (ordersErr || !orders || orders.length === 0) { json(res, 404, { error: "Order tidak ditemukan" }); return; }

      const validOrders = orders.filter((o) => (o.total || 0) - (o.paid_total || 0) > 0);
      if (validOrders.length === 0) { json(res, 400, { error: "Semua order sudah lunas" }); return; }

      const sisaTotal = validOrders.reduce((sum, o) => sum + ((o.total || 0) - (o.paid_total || 0)), 0);

      const checkout = await createCheckoutSession(validOrders.map((o) => o.id), sisaTotal);

      try {
        await sb.from("qris_payments").insert({
          id: "qg-" + randomUUID().replace(/-/g, "").slice(0, 22),
          order_ids: validOrders.map((o) => o.id),
          amount: sisaTotal,
          status: "pending",
          transaction_id: checkout.referenceNo || checkout.orderId,
          requested_amount: sisaTotal,
        });
      } catch (e) {
        console.error("[DOKU-CHECKOUT] Gagal insert qris_payments:", e.message);
      }

      const infoList = [];
      for (const order of validOrders) {
        const { data: items } = await sb.from("order_items").select("product_name, quantity").eq("order_id", order.id);
        let customerName = "";
        if (order.customer_id) {
          const { data: cust } = await sb.from("customers").select("name").eq("id", order.customer_id).single();
          customerName = cust?.name || "";
        }
        infoList.push({
          id: order.id,
          customer_name: customerName,
          total: order.total,
          paid_total: order.paid_total,
          sisa: (order.total || 0) - (order.paid_total || 0),
          items: (items || []).map((i) => `${i.product_name} x${i.quantity}`),
        });
      }

      json(res, 201, {
        group: {
          id: checkout.orderId,
          order_ids: validOrders.map((o) => o.id),
          sisa_total: sisaTotal,
        },
        orders: infoList,
        paymentUrl: checkout.paymentUrl,
        referenceNo: checkout.referenceNo,
      });
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    console.error("[DOKU-CHECKOUT] Error:", err);
    json(res, 500, { error: err.message || "Internal error" });
  }
}
