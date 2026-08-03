-- =====================================================================
--  KOLOM invoice_sent_at di tabel orders
--  Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
--
--  Dipakai menghitung batas pembayaran "2 hari setelah invoice diberikan"
--  di pesan pengingat WA (tanda lonceng). Diisi otomatis saat tombol
--  kirim/salin invoice ditekan.
-- =====================================================================
alter table public.orders add column if not exists invoice_sent_at timestamptz;
