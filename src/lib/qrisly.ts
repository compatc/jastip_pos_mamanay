export interface QrislyGenerateResult {
  meta?: { message?: string; code?: number; status?: string };
  data?: {
    history_id?: number;
    qris_string?: string;
    original_amount?: number;
    final_amount?: number;
    payment_status?: string;
    expiry_time?: string;
  } | null;
}

export interface QrislyStatusResult {
  meta?: { message?: string; code?: number; status?: string };
  data?: {
    history_id?: number;
    payment_status?: string;
    amount?: number;
    name?: string;
    paid_at?: string | null;
    created_at?: string;
    updated_at?: string;
  } | null;
}

export async function generateQris(amount: number): Promise<QrislyGenerateResult> {
  const res = await fetch("/api/qrisly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  return res.json();
}

export async function checkQrisStatus(historyId: number): Promise<QrislyStatusResult> {
  const res = await fetch(`/api/qrisly?history_id=${historyId}`);
  return res.json();
}
