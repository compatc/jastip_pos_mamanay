export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (auth !== "Bearer mamanay2026") return res.status(401).json({ error: "Unauthorized" });

  const { group_jid, message, image } = req.body;
  if (!group_jid || !message) return res.status(400).json({ error: "Missing group_jid or message" });

  const BOT_URL = process.env.BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";

  try {
    const payload = { group_jid, message };

    if (image) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const imgRes = await fetch(image, { signal: controller.signal });
        clearTimeout(timeout);

        if (imgRes.ok) {
          const arrBuf = await imgRes.arrayBuffer();
          const b64 = Buffer.from(arrBuf).toString("base64");
          const ct = imgRes.headers.get("content-type") || "image/jpeg";
          payload.image_url = `data:${ct};base64,${b64}`;
        } else {
          console.error("[send-group] Image fetch HTTP", imgRes.status, image);
        }
      } catch (imgErr) {
        console.error("[send-group] Image fetch failed:", imgErr.message, image);
      }
    }

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
