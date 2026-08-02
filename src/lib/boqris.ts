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
}

async function request(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`/api/boqris${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
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
  return request("", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function checkBoqrisStatus(transactionId: string): Promise<BoqrisTransaction> {
  return request(`?transaction_id=${encodeURIComponent(transactionId)}`);
}
