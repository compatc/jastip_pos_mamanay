import "dotenv/config";
import http from "node:http";
import { generateQris, getPaymentStatus } from "../api/qrisly.mjs";

const PORT = Number(process.env.QRISLY_DEV_PORT || 8788);

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.startsWith("/api/qrisly")) {
    sendJson(res, 404, { meta: { message: "Not found", code: 404, status: "error" }, data: null });
    return;
  }

  try {
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
      const amount = Number(body.amount);
      if (!amount || amount < 1000) {
        sendJson(res, 400, { meta: { message: "amount wajib diisi minimal 1000", code: 400, status: "error" }, data: null });
        return;
      }
      const result = await generateQris(amount);
      sendJson(res, result.status, result.data);
      return;
    }

    if (req.method === "GET") {
      const historyId = url.searchParams.get("history_id");
      if (!historyId) {
        sendJson(res, 400, { meta: { message: "history_id wajib diisi", code: 400, status: "error" }, data: null });
        return;
      }
      const result = await getPaymentStatus(historyId);
      sendJson(res, result.status, result.data);
      return;
    }

    sendJson(res, 405, { meta: { message: "Method not allowed", code: 405, status: "error" }, data: null });
  } catch (e) {
    sendJson(res, 500, { meta: { message: e.message || "Terjadi kesalahan", code: 500, status: "error" }, data: null });
  }
});

server.listen(PORT, () => {
  console.log(`QRISLY dev server jalan di http://localhost:${PORT}/api/qrisly`);
});
