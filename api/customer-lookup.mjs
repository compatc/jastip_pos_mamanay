import { getAdmin } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
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
      if (error) {
        json(res, 500, { error: error.message });
        return;
      }
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
      .not("phone", "eq", "")
      .limit(500);

    if (error) {
      json(res, 500, { error: error.message });
      return;
    }

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
