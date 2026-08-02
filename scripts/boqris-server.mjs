import { createServer } from "node:http";
import "dotenv/config";
import handler from "../api/boqris.mjs";

const port = Number(process.env.BOQRIS_DEV_PORT || 8788);

createServer((req, res) => {
  handler(req, res).catch((err) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  });
}).listen(port, () => {
  console.log(`BOQris dev server: http://localhost:${port}`);
});
