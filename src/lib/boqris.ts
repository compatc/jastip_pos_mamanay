export interface BoqrisTransaction {
  transaction_id: string;
  status: "pending" | "paid" | "expired";
  merchant_id: string | null;
  base_amount: number;
  unique_code: number;
  amount: number;
  invoice_no: string | null;
  qris_dynamic: string;
  qr_url: string;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  timezone: string;
  requested_amount?: number;
  custom_unique_code?: number;
}

async function request(body: any, init?: RequestInit): Promise<any> {
  const res = await fetch("/api/pay", {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Error ${res.status}`);
  }
  return data;
}

export async function createBoqrisTransaction(options: {
  amount: number;
  invoice_no?: string;
  expires_in?: number;
}): Promise<BoqrisTransaction> {
  const orderId = options.invoice_no || "";
  const resp = await request({ action: "create", orderId });
  return resp.tx || resp;
}

export async function checkBoqrisStatus(transactionId: string): Promise<BoqrisTransaction> {
  const resp = await request({ action: "status", transactionId });
  return resp.tx || resp;
}
