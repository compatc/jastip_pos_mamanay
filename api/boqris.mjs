const BASE = process.env.BOQRIS_BASE_URL || "https://api.boqris.id";
const EXPIRES_IN = Math.min(Math.max(Number(process.env.BOQRIS_EXPIRES_IN || 3600) || 3600, 60), 3600);
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

let _adminSb = null;
async function getAdmin() {
  if (_adminSb) return _adminSb;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const sb = createClient(url, key);
  const email = process.env.SUPABASE_EMAIL || process.env.BOT_EMAIL;
  const password = process.env.SUPABASE_PASSWORD || process.env.BOT_PASSWORD;
  if (email && password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[BOQRIS] signIn failed:", error.message);
      throw new Error("Login Supabase gagal: " + error.message);
    }
  } else {
    console.error("[BOQRIS] Missing SUPABASE_EMAIL or SUPABASE_PASSWORD");
  }
  _adminSb = sb;
  return sb;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const apiKey = process.env.BOQRIS_API_KEY;
  const merchantId = process.env.BOQRIS_MERCHANT_ID;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const transactionId = url.searchParams.get("transaction_id");

  try {
    if (req.method === "POST") {
      if (!apiKey || !merchantId) {
        json(res, 500, { error: "BOQRIS_API_KEY atau BOQRIS_MERCHANT_ID belum di-set" });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        json(res, 400, { error: "amount harus bilangan bulat positif" });
        return;
      }

      const orderIds = Array.isArray(body.order_ids) ? body.order_ids : (body.invoice_no ? String(body.invoice_no).split(",").filter(Boolean) : null);
      const groupId = "qg-" + randomUUID().replace(/-/g, "").slice(0, 22);
      let invoiceNo = groupId.slice(0, 25);

      if (orderIds && orderIds.length > 0) {
        const sb = await getAdmin();
        const { error: insertErr } = await sb.from("qris_payments").insert({
          id: invoiceNo,
          order_ids: orderIds,
          amount: amount,
          status: "pending",
          transaction_id: "",
          requested_amount: amount,
        });
        if (insertErr) {
          console.error("[BOQRIS] qris_payments insert failed:", insertErr.message);
          json(res, 500, { error: "Gagal menyimpan data pembayaran: " + insertErr.message });
          return;
        }
      }

      const basePayload = { merchant_id: merchantId, expires_in: Math.min(Math.max(Number(body.expires_in) || EXPIRES_IN, 60), 3600) };
      if (invoiceNo) basePayload.invoice_no = invoiceNo;
      if (body.expires_in) basePayload.expires_in = Math.min(Math.max(Number(body.expires_in) || 900, 60), 3600);

      const useUniqueAmount = Number(body.unique_amount ?? 0) === 1;
      const FETCH_TIMEOUT_MS = 5000;

      const code = useUniqueAmount ? Math.floor(Math.random() * 100) + 1 : 0;
      const qrAmount = amount - code;
      if (qrAmount <= 0) {
        json(res, 400, { error: "Amount terlalu kecil untuk kode unik" });
        return;
      }
      const payload = {
        ...basePayload,
        amount: qrAmount,
        unique_amount: false,
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const bo = await fetch(`${BASE}/api/v1/transactions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = await bo.json();
        console.log("[BOQRIS] Response:", JSON.stringify({ status: bo.status, amount: data.amount, base_amount: data.base_amount, requested_amount: data.requested_amount }));

        if (bo.status === 201) {
          data.requested_amount = amount;
          data.custom_unique_code = code;
          data.amount = qrAmount;
          console.log("[BOQRIS] Final amount sent to client:", qrAmount, "(code:", code, ")");
          if (invoiceNo) {
            const sb = await getAdmin();
            const { error: updateErr } = await sb.from("qris_payments").update({ transaction_id: data.transaction_id || "" }).eq("id", invoiceNo);
            if (updateErr) console.error("[BOQRIS] qris_payments update failed:", updateErr.message);
          }
          json(res, 201, data);
          return;
        }
        json(res, bo.status, data);
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
          json(res, 504, { error: "BOQris API timeout, coba lagi nanti" });
          return;
        }
        throw err;
      }
      return;
    }

    if (req.method === "GET" && transactionId) {
      if (!apiKey) {
        json(res, 500, { error: "BOQRIS_API_KEY belum di-set" });
        return;
      }
      const bo = await fetch(`${BASE}/api/v1/transactions/${transactionId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await bo.json();
      json(res, bo.status, data);
      return;
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err.message || "Gagal menghubungi BOQris" });
  }
}
