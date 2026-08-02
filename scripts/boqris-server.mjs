import { createServer } from "node:http";
import "dotenv/config";
import boqrisHandler from "../api/boqris.mjs";
import payHandler from "../api/pay.mjs";

const port = Number(process.env.BOQRIS_DEV_PORT || 8788);

function route(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/pay")) {
    return payHandler(req, res);
  }
  if (url.pathname.startsWith("/api/boqris")) {
    return boqrisHandler(req, res);
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}

createServer((req, res) => {
  route(req, res).catch((err) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  });
}).listen(port, () => {
  console.log(`BOQris dev server: http://localhost:${port}`);
});
