export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const { invoices } = req.body;
  if (!Array.isArray(invoices) || invoices.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invoices array required" }));
    return;
  }

  let botUrl = process.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
  const botToken = process.env.VITE_BOT_API_TOKEN || "";

  try {
    const sbRes = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/settings?key=eq.bot_api_url&select=value`,
      {
        headers: {
          apikey: process.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        },
      }
    );
    const sbData = await sbRes.json();
    if (sbData?.[0]?.value) botUrl = sbData[0].value;
  } catch (_) {}

  try {
    const resp = await fetch(`${botUrl}/api/send-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ invoices }),
    });
    const data = await resp.json();
    res.writeHead(resp.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
