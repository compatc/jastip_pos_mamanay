export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (auth !== "Bearer mamanay2026") return res.status(401).json({ error: "Unauthorized" });

  const { group_jid, message, image } = req.body;
  if (!group_jid || !message) return res.status(400).json({ error: "Missing group_jid or message" });

  const BOT_URL = process.env.BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";

  try {
    const payload = { group_jid, message };
    if (image) payload.image_url = image;

    const r = await fetch(`${BOT_URL}/api/send-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    return res.status(r.status).json(d);
  } catch (e) {
    console.error("send-group proxy error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
