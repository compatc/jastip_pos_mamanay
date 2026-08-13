import { getAdmin, reconcilePending } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

// Cron Vercel (GET, header Authorization: Bearer <CRON_SECRET>).
// Memastikan QRIS yang sudah dibayar tetap dikonfirmasi walau halaman
// PayOrder sudah ditutup dan webhook BOQris tidak aktif.
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    json(res, 401, { error: "Forbidden" });
    return;
  }
  try {
    const sb = await getAdmin();
    const results = await reconcilePending(sb);
    const paid = results.filter(r => r.status === "paid").length;
    const expired = results.filter(r => r.status === "expired").length;
    const pending = results.filter(r => r.status === "pending").length;
    console.log(`[RECONCILE] Processed: ${results.length} | paid: ${paid} | expired: ${expired} | pending: ${pending}`);
    json(res, 200, { ok: true, processed: results.length, results });
  } catch (err) {
    console.error("[RECONCILE] Error:", err.message);
    json(res, 500, { error: err.message || "Terjadi kesalahan" });
  }
}
