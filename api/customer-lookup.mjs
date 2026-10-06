import crypto from "node:crypto";
import { getAdmin } from "./pay.mjs";

const REDEEM_RATE = 100;

// ---- Token portal (login = 5 digit terakhir HP, tanpa password) ----
// Token ditandatangani HMAC supaya tulis-ke-db (mis. "Konfirmasi Diterima")
// tidak bisa dilakukan orang yang cuma menebak customer_id.
// Kunci: rahasia server, tidak pernah dikirim ke browser.
const PORTAL_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 hari

function portalSecret() {
  return (
    process.env.PORTAL_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

export function signPortalToken(customerId) {
  const secret = portalSecret();
  if (!secret || !customerId) return "";
  const exp = Math.floor(Date.now() / 1000) + PORTAL_TOKEN_TTL;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(customerId + "." + exp)
    .digest("hex");
  return customerId + "." + exp + "." + sig;
}

export function verifyPortalToken(token) {
  const secret = portalSecret();
  if (!secret || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [customerId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!customerId || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expect = crypto
    .createHmac("sha256", secret)
    .update(customerId + "." + exp)
    .digest("hex");
  const a = Buffer.from(String(sig), "utf8");
  const b = Buffer.from(expect, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return customerId;
}

function calculateMemberLevel(totalSpent) {
  if (totalSpent >= 10000000) return "platinum";
  if (totalSpent >= 5000000) return "gold";
  return "silver";
}

function pointsToDiscount(points) {
  return Math.floor(points / REDEEM_RATE) * 1000;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // POST /api/customer-lookup?action=update-points ΓÇö bot updates points
  if (req.method === "POST") {
    try {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${process.env.BOT_API_TOKEN || "mamanay2026"}`) {
        json(res, 401, { error: "Unauthorized" });
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const { customer_id, points } = body;
      if (!customer_id || points == null) {
        json(res, 400, { error: "customer_id and points required" });
        return;
      }
      const sb = await getAdmin();
      const { error } = await sb.from("customers").update({ points }).eq("id", customer_id);
      if (error) { json(res, 500, { error: error.message }); return; }
      json(res, 200, { ok: true, customer_id, points });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // PUT /api/customer-lookup ΓÇö update customer
  if (req.method === "PUT") {
    try {
      const body = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => data += chunk);
        req.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
        req.on("error", reject);
      });
      const { id, name, phone, address, category } = body;
      if (!id || !name || !phone) {
        json(res, 400, { error: "id, name, phone wajib" });
        return;
      }
      const sb = await getAdmin();
      const { error } = await sb
        .from("customers")
        .update({ name, phone, address: address || "", category: category || "pelanggan" })
        .eq("id", id);
      if (error) { json(res, 500, { error: error.message }); return; }
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  // GET /api/customer-lookup?customer_id=xxx ΓÇö get loyalty points
  const customerId = url.searchParams.get("customer_id");
  if (customerId) {
    try {
      const sb = await getAdmin();
      const { data } = await sb
        .from("customers")
        .select("points, total_spent, member_level")
        .eq("id", customerId)
        .single();
      const totalSpent = data?.total_spent || 0;
      const memberLevel = calculateMemberLevel(totalSpent);
      if (data?.member_level !== memberLevel) {
        await sb.from("customers").update({ member_level: memberLevel }).eq("id", customerId);
      }
      json(res, 200, {
        points: data?.points || 0,
        totalSpent,
        memberLevel,
        discountAvailable: pointsToDiscount(data?.points || 0),
      });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // GET /api/customer-lookup?phone=xxx ΓÇö search by phone
  const last5 = (url.searchParams.get("phone") || "").replace(/\D/g, "");
  if (last5.length < 3) {
    json(res, 400, { error: "Minimal 3 digit" });
    return;
  }

  try {
    const sb = await getAdmin();
    const { data: customers, error } = await sb
      .from("customers")
      .select("id, name, phone")
      .not("phone", "eq", "")
      .limit(500);

    if (error) { json(res, 500, { error: error.message }); return; }

    const matches = (customers || []).filter(c => {
      const digits = (c.phone || "").replace(/\D/g, "");
      return digits.endsWith(last5);
    });

    if (matches.length === 0) {
      json(res, 404, { error: "Nomor tidak ditemukan" });
      return;
    }
    json(res, 200, {
      customers: matches.map((c) => ({ ...c, portal_token: signPortalToken(c.id) })),
    });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
