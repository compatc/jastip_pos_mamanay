-- =====================================================================
--  AKTIFKAN REALTIME untuk tabel orders (notifikasi "QRIS lunas")
--  Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
--
--  Setelah ini, aplikasi menerima event langsung saat webhook BOQris
--  menandai order lunas, lalu muncul toast + bunyi + notifikasi.
--  Tanpa ini aplikasi tetap jalan via polling (8 detik) sebagai cadangan.
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then
  null; -- sudah masuk publication
end $$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'qris_payments'
  ) then
    alter publication supabase_realtime add table public.qris_payments;
  end if;
exception when duplicate_object then
  null;
end $$;
