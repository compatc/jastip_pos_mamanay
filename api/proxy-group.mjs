export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const { group_jid, message, image_url } = req.body || {};
    if (!group_jid || !message) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "group_jid and message required" }));
      return;
    }

    const BOT_URL = process.env.BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";

    if (image_url) {
      const imgRes = await fetch(image_url);
      if (!imgRes.ok) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: `Failed to fetch image: ${imgRes.status}` }));
        return;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const blob = new Blob([buf], { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("group_jid", group_jid);
      fd.append("message", message);
      fd.append("image", blob, "photo.jpg");

      const r = await fetch(`${BOT_URL}/api/send-group`, {
        method: "POST",
        headers: { Authorization: "Bearer mamanay2026" },
        body: fd,
      });
      const d = await r.json();
      res.statusCode = r.status;
      res.end(JSON.stringify(d));
    } else {
      const r = await fetch(`${BOT_URL}/api/send-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
        body: JSON.stringify({ group_jid, message }),
      });
      const d = await r.json();
      res.statusCode = r.status;
      res.end(JSON.stringify(d));
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}
