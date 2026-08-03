-- Web Push: daftar perangkat (HP) yang mau menerima notifikasi QRIS walau app tertutup
-- Jalankan di Supabase -> SQL Editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Setiap user hanya bisa membaca/menambah/menghapus langganan miliknya sendiri.
-- Server (webhook) login sebagai user yang sama, jadi bisa membaca langganan ini.
create policy "push subscriptions select own"
  on public.push_subscriptions
  for select using (auth.uid() = user_id);

create policy "push subscriptions insert own"
  on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "push subscriptions update own"
  on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push subscriptions delete own"
  on public.push_subscriptions
  for delete using (auth.uid() = user_id);
