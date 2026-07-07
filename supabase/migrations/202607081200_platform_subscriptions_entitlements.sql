-- MB-122: Platform subscriptions & feature entitlements (manual billing v1)

alter table public.subscriptions
  alter column plan_key set default 'platform_standard';

alter table public.subscriptions
  add column if not exists go_live_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists billing_provider text not null default 'manual',
  add column if not exists paystack_customer_code text,
  add column if not exists paystack_subscription_code text,
  add column if not exists currency text not null default 'ZAR',
  add column if not exists monthly_amount_cents integer not null default 40000;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feature_entitlement_state') then
    create type public.feature_entitlement_state as enum (
      'hidden', 'preview', 'trialing', 'active', 'expired'
    );
  end if;
end $$;

create table if not exists public.platform_features (
  key text primary key,
  name text not null,
  description text not null default '',
  addon_price_cents integer not null default 0,
  currency text not null default 'ZAR',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_feature_entitlements (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  feature_key text not null references public.platform_features(key) on delete cascade,
  state public.feature_entitlement_state not null default 'preview',
  trial_ends_at timestamptz,
  enabled_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, feature_key)
);

create index if not exists trader_feature_entitlements_trader_idx
  on public.trader_feature_entitlements (trader_id);

alter table public.platform_features enable row level security;
alter table public.trader_feature_entitlements enable row level security;

drop policy if exists "platform admins manage platform features" on public.platform_features;
create policy "platform admins manage platform features"
on public.platform_features for all
using (public.current_app_role() = 'super_admin')
with check (public.current_app_role() = 'super_admin');

drop policy if exists "platform admins manage feature entitlements" on public.trader_feature_entitlements;
create policy "platform admins manage feature entitlements"
on public.trader_feature_entitlements for all
using (public.current_app_role() = 'super_admin')
with check (public.current_app_role() = 'super_admin');

drop policy if exists "tenant owners read feature entitlements" on public.trader_feature_entitlements;
create policy "tenant owners read feature entitlements"
on public.trader_feature_entitlements for select
using (public.is_trader_owner(trader_id));

drop trigger if exists set_platform_features_updated_at on public.platform_features;
create trigger set_platform_features_updated_at
before update on public.platform_features
for each row execute function public.set_updated_at();

drop trigger if exists set_trader_feature_entitlements_updated_at on public.trader_feature_entitlements;
create trigger set_trader_feature_entitlements_updated_at
before update on public.trader_feature_entitlements
for each row execute function public.set_updated_at();

-- Grandfather all existing mentor subscriptions until 31 July 2026.
update public.subscriptions
set
  status = 'trialing',
  trial_ends_at = timestamptz '2026-07-31 23:59:59+02',
  plan_key = 'platform_standard',
  currency = 'ZAR',
  monthly_amount_cents = 40000,
  billing_provider = coalesce(billing_provider, 'manual')
where trader_id in (select id from public.traders);

create or replace function public.is_academy_active(target_trader_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  trader_environment text;
  sub_status public.subscription_status;
  sub_trial_ends_at timestamptz;
  sub_period_ends_at timestamptz;
begin
  select t.environment
  into trader_environment
  from public.traders t
  where t.id = target_trader_id;

  if trader_environment = 'acceptance_test' then
    return true;
  end if;

  select s.status, s.trial_ends_at, s.current_period_ends_at
  into sub_status, sub_trial_ends_at, sub_period_ends_at
  from public.subscriptions s
  where s.trader_id = target_trader_id;

  if not found then
    return false;
  end if;

  if sub_status in ('cancelled', 'past_due') then
    return false;
  end if;

  if sub_status = 'active' then
    if sub_period_ends_at is not null and sub_period_ends_at <= now() then
      return false;
    end if;
    return true;
  end if;

  if sub_status = 'trialing' then
    if sub_trial_ends_at is not null and sub_trial_ends_at <= now() then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.is_academy_active(uuid) to authenticated, service_role;
