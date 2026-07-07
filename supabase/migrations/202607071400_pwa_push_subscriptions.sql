-- MB-121: PWA push subscriptions for daily signal alerts.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trader_id uuid references public.traders(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  origin text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_trader_user_idx
  on public.push_subscriptions (trader_id, user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
on public.push_subscriptions
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table public.notifications
  add column if not exists metadata jsonb;

alter table public.notifications
  add column if not exists conversation_id uuid;
