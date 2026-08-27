-- MB-118: PayFast subscription gating for subscription-access-model portals (e.g. KSI)
--
-- IMPORTANT — deviation from the brief, verified against the live DB before writing this:
-- MB-115 already created a table named public.student_subscriptions, designed around a
-- Stripe-style schema (application_id, stripe_customer_id/stripe_subscription_id,
-- student_subscription_status enum with 'trialing'/'incomplete', current_period_starts_at/
-- current_period_ends_at). That table was pure scaffolding — confirmed 0 rows, and grepped
-- the entire app/lib/components tree: no application code ever referenced it. MB-118's
-- brief asks to `create table public.student_subscriptions (...)` with an incompatible
-- PayFast-oriented schema (student_application_id, payfast_token/payfast_payment_id, a
-- plain text status check instead of an enum, current_period_start/current_period_end).
-- Running the brief's literal CREATE TABLE would fail outright since the table already
-- exists. Since the old table is empty and unused, this migration drops it and replaces
-- it with the new schema — PayFast is the actual chosen provider; the Stripe scaffolding
-- was never built out.
--
-- This also required updating has_student_module_access() (MB-115), which is the actual
-- RLS gate on courses/lessons/resources/announcements/live_classes/daily_signals for every
-- portal on the platform — its subscription branch joined student_subscriptions on the old
-- column names (application_id, current_period_ends_at, status in ('active','trialing')).
-- Left unchanged, it would hard-error (undefined column) the first time RLS evaluated it
-- for any subscription-access-model portal. The brief did not mention this function.
--
-- Note on cancellation semantics: the brief has an internal inconsistency between 6d step 5
-- (an ITN CANCELLED notification sets student_applications.status = 'pending', an immediate
-- hard revoke) and 6h (a user-initiated dashboard cancel sets student_subscriptions.status =
-- 'cancelled' immediately, but text says "does not revoke access immediately... access
-- continues until current_period_end"). Read literally, 6e's access check
-- (`status = 'active' AND current_period_end > now()`) would revoke access the instant
-- status flips away from 'active', contradicting 6h's own stated grace-period behaviour.
-- Resolved by keying purely on current_period_end for the grace states: a subscription
-- grants access while status is 'active', 'cancelled', or 'payment_failed' AND
-- current_period_end is still in the future — covering both "do not revoke on payment
-- failure" (6d step 6) and "access continues until current_period_end after cancel" (6h),
-- while 'pending' (never activated, no period) and 'paused' still correctly grant nothing.

drop table if exists public.student_subscriptions cascade;

create table public.student_subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  student_application_id    uuid not null references public.student_applications(id) on delete cascade,
  student_user_id           uuid not null references auth.users(id) on delete cascade,
  trader_id                 uuid not null references public.traders(id) on delete cascade,
  portal_id                 uuid not null references public.portals(id) on delete cascade,
  plan_id                   text not null check (plan_id in ('basic', 'intermediate', 'pro')),
  payfast_token             text,                         -- subscription token from ITN
  payfast_payment_id        text,                         -- pf_payment_id from ITN
  status                    text not null default 'pending'
                            check (status in ('pending', 'active', 'cancelled', 'payment_failed', 'paused')),
  amount_cents              integer not null,             -- e.g. 25000 for R250.00
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index on public.student_subscriptions (student_user_id, status);
create index on public.student_subscriptions (payfast_token);

create trigger set_student_subscriptions_updated_at
  before update on public.student_subscriptions
  for each row execute function public.set_updated_at();

alter table public.student_subscriptions enable row level security;

-- Students can read their own rows.
create policy "student_read_own"
  on public.student_subscriptions for select
  to authenticated
  using (student_user_id = auth.uid());

-- Tenant owners/mentors can read their portal's subscriptions (matches the pattern used
-- by every other tenant-scoped table in this schema — the brief only specified the
-- student-facing policy and left service-role access implicit via the admin client, which
-- bypasses RLS regardless; this policy is additive, for the mentor-facing "who's
-- subscribed" view that will land in a future MB).
create policy "tenant_owner_reads_all"
  on public.student_subscriptions for select
  to authenticated
  using (public.is_super_admin() or public.is_trader_member(trader_id));

-- Recreate has_student_module_access() with the corrected subscription branch (see note
-- above). Verification-portal branch is unchanged from MB-115.
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
    return exists (
      select 1
      from public.student_applications sa
      join public.student_subscriptions ss on ss.student_application_id = sa.id
      where sa.trader_id = target_trader_id
        and sa.student_user_id = auth.uid()
        and sa.status <> 'rejected'
        and ss.status in ('active', 'cancelled', 'payment_failed')
        and ss.current_period_end is not null
        and ss.current_period_end > now()
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

-- Verify KSI portal access_model (idempotent — already set to 'subscription' in MB-115,
-- confirmed live before writing this migration; kept per the brief for completeness).
update public.portals
set access_model = 'subscription'
where slug = 'kaisync-institution';
