-- MB-122 hotfix: some live traders have no subscriptions row (UPDATE-only backfill missed them).
-- Without a row, is_academy_active() returns false and the dashboard shows "academy paused".

insert into public.subscriptions (
  trader_id,
  status,
  trial_ends_at,
  plan_key,
  currency,
  monthly_amount_cents,
  billing_provider
)
select
  t.id,
  'trialing'::public.subscription_status,
  timestamptz '2026-07-31 23:59:59+02',
  'platform_standard',
  'ZAR',
  40000,
  'manual'
from public.traders t
where not exists (
  select 1 from public.subscriptions s where s.trader_id = t.id
)
and t.environment is distinct from 'acceptance_test';
