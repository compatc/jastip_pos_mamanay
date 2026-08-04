const BASE = process.env.BOQRIS_BASE_URL || "https://api.boqris.id";
const UNIQUE_MAX = Math.max(1, Number(process.env.BOQRIS_UNIQUE_MAX || 200) || 200);
const EXPIRES_IN = Math.min(Math.max(Number(process.env.BOQRIS_EXPIRES_IN || 3600) || 3600, 60), 3600);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const apiKey = process.env.BOQRIS_API_KEY;
  const merchantId = process.env.BOQRIS_MERCHANT_ID;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const transactionId = url.searchParams.get("transaction_id");

  try {
    if (req.method === "POST") {
      if (!apiKey || !merchantId) {
        json(res, 500, { error: "BOQRIS_API_KEY atau BOQRIS_MERCHANT_ID belum di-set" });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        json(res, 400, { error: "amount harus bilangan bulat positif" });
        return;
      }

      const basePayload = { merchant_id: merchantId, expires_in: Math.min(Math.max(Number(body.expires_in) || EXPIRES_IN, 60), 3600) };
      if (body.invoice_no) basePayload.invoice_no = String(body.invoice_no).slice(0, 25);
      if (body.expires_in) basePayload.expires_in = Math.min(Math.max(Number(body.expires_in) || 900, 60), 3600);

      const useUniqueAmount = Number(body.unique_amount ?? 0) === 1;
      let lastStatus = 0;
      let lastData = null;

      const attempts = useUniqueAmount ? [0] : Array.from({ length: UNIQUE_MAX }, (_, i) => i + 1);
      for (const code of attempts) {
        const qrAmount = amount - code;
        if (qrAmount <= 0) break;
        const payload = {
          ...basePayload,
          amount: qrAmount,
          unique_amount: useUniqueAmount,
        };
        const bo = await fetch(`${BASE}/api/v1/transactions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await bo.json();
        lastStatus = bo.status;
        lastData = data;

        if (bo.status === 201) {
          data.requested_amount = amount;
          data.custom_unique_code = useUniqueAmount ? (data.unique_code ?? 0) : code;
          json(res, 201, data);
          return;
        }
        if (bo.status !== 409) {
          json(res, bo.status, data);
          return;
        }
      }

      json(res, lastStatus, lastData || { error: "Semua kode unik terpakai, coba lagi nanti" });
      return;
    }

    if (req.method === "GET" && transactionId) {
      if (!apiKey) {
        json(res, 500, { error: "BOQRIS_API_KEY belum di-set" });
        return;
      }
      const bo = await fetch(`${BASE}/api/v1/transactions/${transactionId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await bo.json();
      json(res, bo.status, data);
      return;
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err.message || "Gagal menghubungi BOQris" });
  }
}
