import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BOQRIS_BASE = process.env.BOQRIS_BASE_URL || "https://api.boqris.id";
const BOQRIS_UNIQUE_MAX = Math.max(1, Number(process.env.BOQRIS_UNIQUE_MAX || 20) || 20);

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

async function createBoqrisTransaction(amount, invoiceNo) {
  const apiKey = process.env.BOQRIS_API_KEY;
  const merchantId = process.env.BOQRIS_MERCHANT_ID;
  if (!apiKey || !merchantId) throw new Error("BOQRIS_API_KEY atau BOQRIS_MERCHANT_ID belum di-set");

  const basePayload = { merchant_id: merchantId };
  if (invoiceNo) basePayload.invoice_no = String(invoiceNo).slice(0, 25);

  for (let code = 1; code <= BOQRIS_UNIQUE_MAX; code++) {
    const payload = { ...basePayload, amount: amount + code, unique_amount: false };
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
    const body = JSON.parse((await readBody(req)) || "{}");
    const sb = await getAdmin();

    if (body.action === "create") {
      const orderId = String(body.orderId || "");
      if (!orderId) {
        json(res, 400, { error: "orderId wajib diisi" });
        return;
      }

      const { data: order, error } = await sb
        .from("orders")
        .select("id, customer_id, total, paid_total, order_type, account_id, notes, status")
        .eq("id", orderId)
        .single();
      if (error || !order) {
        json(res, 404, { error: "Order tidak ditemukan" });
        return;
      }

      const sisa = (order.total || 0) - (order.paid_total || 0);
      if (sisa <= 0) {
        json(res, 400, { error: "Order sudah lunas" });
        return;
      }

      const { data: items } = await sb
        .from("order_items")
        .select("product_name, quantity")
        .eq("order_id", orderId);

      let customerName = "";
      if (order.customer_id) {
        const { data: cust } = await sb
          .from("customers")
          .select("name")
          .eq("id", order.customer_id)
          .single();
        customerName = cust?.name || "";
      }

      const tx = await createBoqrisTransaction(sisa, orderId.slice(0, 25));

      json(res, 201, {
        order: {
          id: order.id,
          customer_name: customerName,
          total: order.total,
          paid_total: order.paid_total,
          sisa,
          items: (items || []).map((i) => `${i.product_name} x${i.quantity}`),
        },
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
      const orderId = String(body.orderId || "");
      const transactionId = String(body.transactionId || "");
      if (!orderId || !transactionId) {
        json(res, 400, { error: "orderId dan transactionId wajib diisi" });
        return;
      }

      const bo = await checkBoqrisTransaction(transactionId);
      if (bo.status !== "paid") {
        json(res, 200, { status: bo.status || "pending", confirmed: false });
        return;
      }

      const { data: order, error } = await sb
        .from("orders")
        .select("id, customer_id, total, paid_total, order_type, account_id, status, notes")
        .eq("id", orderId)
        .single();
      if (error || !order) {
        json(res, 404, { error: "Order tidak ditemukan" });
        return;
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

      json(res, 200, { status: "paid", confirmed: true });
      return;
    }

    json(res, 400, { error: "action tidak dikenal" });
  } catch (err) {
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
