-- =====================================================================
--  TABEL qris_payments: mapping transaksi QRIS gabungan -> order
--  Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
--  (jalankan SETELAH rls_setup.sql, sekali saja)
--
--  Fungsi: menyimpan "satu pembayaran QRIS untuk beberapa order".
--  id = invoice_no yang dipakai BOQris (25 karakter), dipakai webhook
--  untuk tahu order mana saja yang harus dilunasi.
-- =====================================================================

create table if not exists public.qris_payments (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  order_ids jsonb not null default '[]',
  amount numeric not null default 0,
  status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) TRIGGER otomatis isi user_id dari user yang sedang login
create or replace function public.set_user_id_qris_payments()
returns trigger language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_user_id_qris_payments on public.qris_payments;
create trigger set_user_id_qris_payments before insert on public.qris_payments
  for each row execute function public.set_user_id_qris_payments();

-- 3) INDEX
create index if not exists qris_payments_user_id_idx on public.qris_payments(user_id);

-- 4) RLS
alter table public.qris_payments enable row level security;

drop policy if exists qris_payments_select on public.qris_payments;
create policy qris_payments_select on public.qris_payments
  for select using (auth.uid()::text = user_id::text);

drop policy if exists qris_payments_insert on public.qris_payments;
create policy qris_payments_insert on public.qris_payments
  for insert with check (auth.uid()::text = user_id::text);

drop policy if exists qris_payments_update on public.qris_payments;
create policy qris_payments_update on public.qris_payments
  for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);

drop policy if exists qris_payments_delete on public.qris_payments;
create policy qris_payments_delete on public.qris_payments
  for delete using (auth.uid()::text = user_id::text);
