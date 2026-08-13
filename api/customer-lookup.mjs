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
    const { data: customers, error } = await sb
      .from("customers")
      .select("id, name, phone")
      .ilike("phone", `%${last5}`)
      .limit(5);

    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    if (!customers || customers.length === 0) {
      json(res, 404, { error: "Nomor tidak ditemukan" });
      return;
    }
    json(res, 200, { customers });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
