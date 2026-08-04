-- =====================================================================
--  RECONCILIATION QRIS: simpan transaction_id BOQris di qris_payments
--  Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
--
--  Fungsi: memungkinkan cron/auto-check menanyakan status transaksi ke
--  BOQris untuk pembayaran yang belum sempat dikonfirmasi webhook/polling.
-- =====================================================================

alter table public.qris_payments add column if not exists transaction_id text;
alter table public.qris_payments add column if not exists requested_amount numeric;

create index if not exists qris_payments_status_idx on public.qris_payments(status);
