import { getAdmin } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");
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

  try {
    const sb = await getAdmin();
    const { data, error } = await sb
      .from("products")
      .select("id, name, sell_price, stock, unit, image")
      .order("name", { ascending: true });

    if (error) {
      json(res, 500, { error: error.message });
      return;
    }

    json(res, 200, { ok: true, data: data || [] });
  } catch (e) {
    console.error("catalog error:", e);
    json(res, 500, { error: e.message });
  }
}
