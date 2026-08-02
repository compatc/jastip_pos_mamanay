const QRISLY_API_KEY = process.env.QRISLY_API_KEY || "";
const QRISLY_QRIS_ID = process.env.QRISLY_QRIS_ID || "";
const QRISLY_BASE_URL =
  process.env.QRISLY_BASE_URL || "https://api-sandbox.collaborator.komerce.id/user";

export async function generateQris(amount) {
  const res = await fetch(`${QRISLY_BASE_URL}/api/v1/qrisly/generate-qris`, {
    method: "POST",
    headers: {
      "x-api-key": QRISLY_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      qris_id: Number(QRISLY_QRIS_ID),
      amount,
      output_type: "string",
      unique_amount: true,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data: json || { meta: { message: `HTTP ${res.status}` } },
    };
  }
  return { ok: true, status: res.status, data: json };
}

export async function getPaymentStatus(historyId) {
  const res = await fetch(
    `${QRISLY_BASE_URL}/api/v1/qrisly/payment-status/${historyId}`,
    {
      headers: { "x-api-key": QRISLY_API_KEY },
    }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data: json || { meta: { message: `HTTP ${res.status}` } },
    };
  }
  return { ok: true, status: res.status, data: json };
}

export default async function handler(req, res) {
  if (!QRISLY_API_KEY || !QRISLY_QRIS_ID) {
    res.status(500).json({
      meta: {
        message:
          "QRISLY belum dikonfigurasi. Set QRISLY_API_KEY & QRISLY_QRIS_ID di environment.",
        code: 500,
        status: "error",
      },
      data: null,
    });
    return;
  }

  try {
    if (req.method === "POST") {
      let body = {};
      try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      } catch {
        body = {};
      }
      const amount = Number(body.amount);
      if (!amount || amount < 1000) {
        res.status(400).json({
          meta: { message: "amount wajib diisi minimal 1000", code: 400, status: "error" },
          data: null,
        });
        return;
      }
      const result = await generateQris(amount);
      res.status(result.status).json(result.data);
      return;
    }

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const historyId = url.searchParams.get("history_id");
      if (!historyId) {
        res.status(400).json({
          meta: { message: "history_id wajib diisi", code: 400, status: "error" },
          data: null,
        });
        return;
      }
      const result = await getPaymentStatus(historyId);
      res.status(result.status).json(result.data);
      return;
    }

    res.status(405).json({
      meta: { message: "Method not allowed", code: 405, status: "error" },
      data: null,
    });
  } catch (e) {
    res.status(500).json({
      meta: { message: e.message || "Terjadi kesalahan", code: 500, status: "error" },
      data: null,
    });
  }
}
