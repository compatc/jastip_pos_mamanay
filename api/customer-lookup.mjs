import { getAdmin } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const last5 = (url.searchParams.get("phone") || "").replace(/\D/g, "");

  if (last5.length < 3) {
    json(res, 400, { error: "Minimal 3 digit" });
    return;
  }

  try {
    const sb = await getAdmin();
    // Ambil semua customer, strip non-digit, cari match
    const { data: customers, error } = await sb
      .from("customers")
      .select("id, name, phone")
      .not("phone", "eq", "")
      .limit(500);

    if (error) {
      json(res, 500, { error: error.message });
      return;
    }

    // Filter: strip semua non-digit dari phone, lalu cari yang berakhir dengan last5
    const matches = (customers || []).filter(c => {
      const digits = (c.phone || "").replace(/\D/g, "");
      return digits.endsWith(last5);
    });

    if (matches.length === 0) {
      json(res, 404, { error: "Nomor tidak ditemukan" });
      return;
    }
    json(res, 200, { customers: matches });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
