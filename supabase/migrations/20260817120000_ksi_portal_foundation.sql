-- MB-115: KSI portal foundation — subscription access model + per-portal feature flags

-- 1. Allow one user to own multiple traders (needed for KSI owned by kaisynctech@gmail.com).
--    RLS is enforced via trader_members, not owner_user_id — dropping this constraint
--    has no effect on row-level security. current_trader_id() returns the oldest membership
--    for users in multiple workspaces; this is a pre-existing known limitation for super_admin
--    and does not affect regular students or mentors who belong to one workspace only.
--    Note: verified 2026-08-17 that no traders_owner_user_id_key constraint currently exists
--    on public.traders (kaisynctech@gmail.com already owns 5 traders without one). This
--    statement is kept as a documented no-op guard in case the constraint is reintroduced.
alter table public.traders
  drop constraint if exists traders_owner_user_id_key;

-- 2. Access model per portal.
--    'verification' = existing broker-verification flow (TC, PASII, Milkers FX, KaiTrades).
--    'subscription'  = student pays monthly; access gated by active student_subscription row.
alter table public.portals
  add column if not exists access_model text not null default 'verification'
    check (access_model in ('verification', 'subscription'));

-- 3. Per-portal student feature flags.
--    JSONB map of feature keys to booleans. Application reads this to show/hide tabs.
--    Example: '{"ai_tools": true, "quizzes": false}'
--    Default '{}' means no extra features — preserves existing portal behaviour exactly.
alter table public.portals
  add column if not exists student_portal_features jsonb not null default '{}';

-- 4. Update student access policy constraint to allow subscription portals.
--    Previous constraint required require_broker_verification_for_modules OR
--    allow_full_access_without_verification — subscription portals satisfy neither.
alter table public.portals
  drop constraint if exists portals_student_access_policy_valid;

alter table public.portals
  add constraint portals_student_access_policy_valid
    check (
      access_model = 'subscription'
      or require_broker_verification_for_modules
      or allow_full_access_without_verification
    );

-- 5. Student subscription plans (one per portal per tier).
create table if not exists public.student_subscription_plans (
  id                  uuid primary key default gen_random_uuid(),
  trader_id           uuid not null references public.traders(id) on delete cascade,
  portal_id           uuid not null references public.portals(id) on delete cascade,
  name                text not null,                          -- 'Basic', 'Intermediate', 'Pro'
  slug                text not null,                          -- 'basic', 'intermediate', 'pro'
  description         text not null default '',
  amount_cents        integer not null check (amount_cents >= 0),
  currency            text not null default 'ZAR',
  billing_interval    text not null default 'month'
                        check (billing_interval in ('month', 'year')),
  stripe_price_id     text,                                   -- set after Stripe product created (MB-116)
  features            jsonb not null default '{}',            -- plan-level feature flags
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (portal_id, slug)
);

create index if not exists student_subscription_plans_portal_idx
  on public.student_subscription_plans (portal_id, is_active, sort_order);

-- 6. Student subscriptions (one active row per student per portal).
--    NOTE: `create type ... if not exists` is not valid PostgreSQL syntax for enum types
--    (unlike CREATE TABLE/INDEX). Wrapped in a guarded DO block instead. Verified 2026-08-17
--    that no `student_subscription_status` type currently exists.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'student_subscription_status') then
    create type public.student_subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'cancelled',
      'incomplete'
    );
  end if;
end $$;

create table if not exists public.student_subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  trader_id                 uuid not null references public.traders(id) on delete cascade,
  portal_id                 uuid not null references public.portals(id) on delete cascade,
  application_id            uuid not null references public.student_applications(id) on delete cascade,
  plan_id                   uuid not null references public.student_subscription_plans(id) on delete restrict,
  status                    public.student_subscription_status not null default 'incomplete',
  stripe_customer_id        text,
  stripe_subscription_id    text unique,
  current_period_starts_at  timestamptz,
  current_period_ends_at    timestamptz,
  trial_ends_at             timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (application_id)   -- one active subscription per student per portal
);

create index if not exists student_subscriptions_trader_idx
  on public.student_subscriptions (trader_id, status);

create index if not exists student_subscriptions_application_idx
  on public.student_subscriptions (application_id);

-- 7. Triggers.
drop trigger if exists set_student_subscription_plans_updated_at on public.student_subscription_plans;
create trigger set_student_subscription_plans_updated_at
  before update on public.student_subscription_plans
  for each row execute function public.set_updated_at();

drop trigger if exists set_student_subscriptions_updated_at on public.student_subscriptions;
create trigger set_student_subscriptions_updated_at
  before update on public.student_subscriptions
  for each row execute function public.set_updated_at();

-- 8. RLS.
alter table public.student_subscription_plans enable row level security;
alter table public.student_subscriptions enable row level security;

-- Plans: public read for published portals; owner manages.
drop policy if exists "public read active plans" on public.student_subscription_plans;
create policy "public read active plans"
  on public.student_subscription_plans for select
  using (is_active = true);

drop policy if exists "tenant owner manages plans" on public.student_subscription_plans;
create policy "tenant owner manages plans"
  on public.student_subscription_plans for all
  using (public.is_super_admin() or public.is_trader_member(trader_id))
  with check (public.is_super_admin() or public.is_trader_member(trader_id));

-- Subscriptions: students read own; owners read all in workspace.
drop policy if exists "students read own subscription" on public.student_subscriptions;
create policy "students read own subscription"
  on public.student_subscriptions for select
  using (
    exists (
      select 1 from public.student_applications sa
      where sa.id = application_id
        and sa.student_user_id = auth.uid()
    )
  );

drop policy if exists "tenant owner reads all subscriptions" on public.student_subscriptions;
create policy "tenant owner reads all subscriptions"
  on public.student_subscriptions for all
  using (public.is_super_admin() or public.is_trader_member(trader_id))
  with check (public.is_super_admin() or public.is_trader_member(trader_id));

-- 9. Update has_student_module_access() to handle subscription portals.
create or replace function public.has_student_module_access(target_trader_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  portal_access_model text;
begin
  select p.access_model
  into portal_access_model
  from public.portals p
  where p.trader_id = target_trader_id;

  if not found then
    return false;
  end if;

  if portal_access_model = 'subscription' then
    -- Subscription portal: student must have an active or trialing subscription.
    return exists (
      select 1
      from public.student_applications sa
      join public.student_subscriptions ss on ss.application_id = sa.id
      where sa.trader_id = target_trader_id
        and sa.student_user_id = auth.uid()
        and sa.status <> 'rejected'
        and ss.status in ('active', 'trialing')
        and (ss.current_period_ends_at is null or ss.current_period_ends_at > now())
        and (ss.trial_ends_at is null or ss.trial_ends_at > now() or ss.status = 'active')
    );
  end if;

  -- Verification portal: existing logic.
  return exists (
    select 1
    from public.student_applications application
    join public.portals portal on portal.id = application.portal_id
    where application.trader_id = target_trader_id
      and application.student_user_id = auth.uid()
      and application.status <> 'rejected'
      and (
        portal.allow_full_access_without_verification
        or (
          portal.require_broker_verification_for_modules
          and (
            application.broker_verified
            or application.status = 'verified'
          )
        )
      )
  );
end;
$$;

grant execute on function public.has_student_module_access(uuid) to authenticated, service_role;

-- 10. grants.
grant select on public.student_subscription_plans to anon, authenticated;
grant select on public.student_subscriptions to authenticated;
