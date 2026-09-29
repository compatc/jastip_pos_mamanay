-- =====================================================================
--  KOLOM shipping_method di tabel orders
--  Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
--
--  Menyimpan pilihan pengiriman customer di halaman invoice:
--  'manual'  = kirim manual (JNT/JNE/LION, admin atur)
--  'shopee   = customer checkout sendiri di Shopee (link + pcs + catatan)
-- =====================================================================
alter table public.orders add column if not exists shipping_method text;
