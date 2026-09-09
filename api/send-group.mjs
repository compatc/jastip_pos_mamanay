export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (auth !== "Bearer mamanay2026") return res.status(401).json({ error: "Unauthorized" });

  const { group_jid, message, image } = req.body;
  if (!group_jid || !message) return res.status(400).json({ error: "Missing group_jid or message" });

  const BOT_URL = process.env.BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";

  try {
    if (image) {
      const imgRes = await fetch(image);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      const arrBuf = await imgRes.arrayBuffer();
      const blob = new Blob([arrBuf], { type: "image/jpeg" });

      const form = new FormData();
      form.append("group_jid", group_jid);
      form.append("message", message);
      form.append("image", blob, "image.jpg");

      const r = await fetch(`${BOT_URL}/api/send-group`, {
        method: "POST",
        headers: { Authorization: "Bearer mamanay2026" },
        body: form,
      });
      const d = await r.json();
      return res.status(r.status).json(d);
    }

    const r = await fetch(`${BOT_URL}/api/send-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
      body: JSON.stringify({ group_jid, message }),
    });
    const d = await r.json();
    return res.status(r.status).json(d);
  } catch (e) {
    console.error("send-group proxy error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
