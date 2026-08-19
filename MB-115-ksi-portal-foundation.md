# MB-115 — KSI Portal Foundation & Student Subscription Access Model

**Status:** Ready for Engineering  
**Date:** 2026-08-17  
**Depends on:** None (first KSI brief)  
**Blocks:** MB-116 (Stripe integration), MB-117 (extended registration), MB-118 (public website)

---

## Context

Kai Sync Institution (KSI) is a new academy on the KaiMentors platform. Unlike existing portals (TC, PASII, Milkers FX) which use the broker-verification access model, KSI students pay a monthly subscription. Access to portal features is gated by subscription plan, not by broker verification.

This Brief establishes:
1. The DB schema for subscription-based student access
2. Per-portal feature flag infrastructure
3. The KSI workspace records
4. Application-layer utilities to read and use these

---

## Pre-flight: Verify owner constraint

Before running any migration, confirm whether `kaisynctech@gmail.com` is already an `owner_user_id` in the `traders` table:

```sql
SELECT t.id, t.display_name, t.owner_user_id, p.email
FROM public.traders t
JOIN public.profiles p ON p.id = t.owner_user_id
ORDER BY t.created_at;
```

**Expected result:** `kaisynctech@gmail.com` owns KaiTrades. Because `traders.owner_user_id` has a UNIQUE constraint, a second trader with the same email cannot be inserted. The migration below removes that constraint. Read the RLS impact note in Task 1 before proceeding.

---

## Task 1 — Migration: schema additions

**File:** `supabase/migrations/20260817120000_ksi_portal_foundation.sql`

```sql
-- MB-115: KSI portal foundation — subscription access model + per-portal feature flags

-- 1. Allow one user to own multiple traders (needed for KSI owned by kaisynctech@gmail.com).
--    RLS is enforced via trader_members, not owner_user_id — dropping this constraint
--    has no effect on row-level security. current_trader_id() returns the oldest membership
--    for users in multiple workspaces; this is a pre-existing known limitation for super_admin
--    and does not affect regular students or mentors who belong to one workspace only.
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
create type if not exists public.student_subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'incomplete'
);

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
```

---

## Task 2 — Create KSI workspace records

Run the following SQL **after the migration is applied and verified**. Execute via Supabase MCP `execute_sql`.

### Step A — Verify the owner profile exists

```sql
SELECT id, email, full_name
FROM public.profiles
WHERE email = 'kaisynctech@gmail.com';
```

Copy the `id` value — this is `[OWNER_USER_ID]` used in the inserts below.

### Step B — Insert KSI trader

```sql
INSERT INTO public.traders (
  owner_user_id,
  legal_name,
  display_name,
  status,
  timezone,
  support_email,
  environment
)
VALUES (
  '[OWNER_USER_ID]',
  'KaiSync Institution',
  'KaiSync Institution',
  'active',
  'Africa/Johannesburg',
  'kaisynctech@gmail.com',
  'production'
)
RETURNING id;
```

Copy the returned `id` — this is `[KSI_TRADER_ID]`.

### Step C — Verify auto-add trigger result

```sql
SELECT user_id, role FROM public.trader_members
WHERE trader_id = '[KSI_TRADER_ID]';
```

The `traders_auto_add_system_owner` trigger will attempt to insert `kaisynctech@gmail.com`. Because `kaisynctech@gmail.com` is also the `owner_user_id` of this trader, the trigger may produce a duplicate row or conflict. Confirm there is exactly one row for this user. If the trigger fails with a duplicate key error, check whether the trigger has `ON CONFLICT DO NOTHING` — if not, the migration `20260703000000_traders_auto_add_system_owner.sql` must be updated to add it. Report the actual result before proceeding.

### Step D — Get default risk disclosure template

```sql
SELECT id FROM public.risk_disclosure_templates LIMIT 1;
```

Copy the `id` — this is `[RISK_TEMPLATE_ID]`.

### Step E — Insert KSI portal

```sql
INSERT INTO public.portals (
  trader_id,
  slug,
  portal_name,
  hero_title,
  hero_subtitle,
  primary_color,
  accent_color,
  cta_label,
  is_published,
  website_delivery_mode,
  academy_description,
  contact_email,
  risk_disclosure_template_id,
  risk_disclosure_enabled,
  access_model,
  require_broker_verification_for_modules,
  allow_full_access_without_verification,
  student_portal_features
)
VALUES (
  '[KSI_TRADER_ID]',
  'kaisync-institution',
  'KaiSync Institution',
  'Learn AI. Build Products. Change Your Future.',
  'South Africa''s premier AI education platform',
  '#1A0A3D',
  '#00C4D8',
  'Enrol Now',
  false,
  'core_page',
  'KaiSync Institution teaches practical AI skills — from building websites and apps to automations, agents, and business growth.',
  'kaisynctech@gmail.com',
  '[RISK_TEMPLATE_ID]',
  false,
  'subscription',
  false,
  false,
  '{"ai_tools": true}'
)
RETURNING id;
```

Copy the returned `id` — this is `[KSI_PORTAL_ID]`.

### Step F — Insert platform subscription for KSI (mentor billing)

This is the portal owner's platform subscription (R400/month to use KaiMentors), not a student subscription.

```sql
INSERT INTO public.subscriptions (
  trader_id,
  status,
  trial_ends_at,
  plan_key,
  currency,
  monthly_amount_cents,
  billing_provider
)
VALUES (
  '[KSI_TRADER_ID]',
  'trialing',
  timestamptz '2026-08-31 23:59:59+02',
  'platform_standard',
  'ZAR',
  40000,
  'manual'
)
ON CONFLICT (trader_id) DO NOTHING;
```

### Step G — Insert KSI student subscription plans

```sql
INSERT INTO public.student_subscription_plans
  (trader_id, portal_id, name, slug, description, amount_cents, currency, sort_order, features)
VALUES
  (
    '[KSI_TRADER_ID]', '[KSI_PORTAL_ID]',
    'Basic', 'basic',
    'Access all courses and the AI tools directory.',
    25000, 'ZAR', 1,
    '{"courses": true, "ai_tools": true, "community": true}'
  ),
  (
    '[KSI_TRADER_ID]', '[KSI_PORTAL_ID]',
    'Intermediate', 'intermediate',
    'Everything in Basic plus live classes and group sessions.',
    40000, 'ZAR', 2,
    '{"courses": true, "ai_tools": true, "community": true, "live_classes": true, "groups": true}'
  ),
  (
    '[KSI_TRADER_ID]', '[KSI_PORTAL_ID]',
    'Pro', 'pro',
    'Full access including one-on-one bookings and priority support.',
    70000, 'ZAR', 3,
    '{"courses": true, "ai_tools": true, "community": true, "live_classes": true, "groups": true, "one_on_one": true, "priority_support": true}'
  );
```

### Step H — Verify

```sql
SELECT
  t.display_name AS trader,
  p.slug AS portal_slug,
  p.access_model,
  p.student_portal_features,
  p.is_published,
  s.status AS platform_sub_status,
  s.trial_ends_at
FROM public.traders t
JOIN public.portals p ON p.trader_id = t.id
JOIN public.subscriptions s ON s.trader_id = t.id
WHERE t.display_name = 'KaiSync Institution';

SELECT name, slug, amount_cents, features
FROM public.student_subscription_plans
WHERE portal_id = '[KSI_PORTAL_ID]'
ORDER BY sort_order;
```

Both queries must return the correct rows with no errors before this task is marked complete.

---

## Task 3 — Application code

### 3a. `lib/workspace.ts`

In `getMentorWorkspace()`, extend the return type to include new portal fields:

```typescript
// Add to the return object (both the custom-domain path and the cookie path):
accessModel: portal.access_model as 'verification' | 'subscription',
studentPortalFeatures: (portal.student_portal_features ?? {}) as Record<string, boolean>,
```

The Supabase select query that fetches the portal must also include these two columns:

```typescript
.select('..., access_model, student_portal_features')
```

Verify the exact column names in the query against what is already selected; do not guess — read the current `getMentorWorkspace()` implementation first.

### 3b. New file: `lib/portal-features.ts`

```typescript
/**
 * Returns true if the given feature flag is enabled for this portal.
 * Used to show/hide student portal tabs and mentor settings sections.
 */
export function isFeatureEnabled(
  features: Record<string, boolean> | undefined | null,
  key: string
): boolean {
  if (!features) return false;
  return features[key] === true;
}

/**
 * Returns true if the portal uses the subscription access model.
 */
export function isSubscriptionPortal(
  accessModel: 'verification' | 'subscription' | undefined | null
): boolean {
  return accessModel === 'subscription';
}
```

### 3c. `lib/student-routing.ts`

Add `accessModel` and `studentPortalFeatures` to `StudentAcademyContext`:

```typescript
export interface StudentAcademyContext {
  basePath: '/academy' | '/student';
  joinAcademyPath: string;
  portalId: string | null;
  portalSlug: string | null;
  querySuffix: string;
  accessModel: 'verification' | 'subscription';
  studentPortalFeatures: Record<string, boolean>;
}
```

In `getStudentAcademyContext()`, read these values from the portal row. The function already queries the portal — extend the select to include `access_model` and `student_portal_features`, and pass them through to the returned context object.

Verify the exact query in the current implementation before editing — read the file first.

---

## Acceptance criteria

1. Migration applies cleanly with no errors: `npx supabase db push` (or equivalent)
2. `SELECT * FROM portals WHERE slug = 'kaisync-institution'` returns one row with `access_model = 'subscription'`, `student_portal_features = '{"ai_tools": true}'`
3. `SELECT * FROM student_subscription_plans WHERE portal_id = '[KSI_PORTAL_ID]' ORDER BY sort_order` returns Basic / Intermediate / Pro rows with correct `amount_cents`
4. `SELECT * FROM traders WHERE display_name = 'KaiSync Institution'` returns one row with no UNIQUE constraint error
5. `SELECT * FROM trader_members WHERE trader_id = '[KSI_TRADER_ID]'` returns exactly one row for `kaisynctech@gmail.com`
6. TypeScript build passes: `npx tsc --noEmit`
7. Report the result of Step C (trigger behaviour) — if the trigger created a duplicate or errored, report before marking complete

---

## Notes

- `is_published = false` intentionally — KSI goes live when the public website (MB-118) is ready
- `risk_disclosure_enabled = false` — KSI is an AI education platform, not a trading portal; no risk disclosure needed
- Plan `features` JSONB in `student_subscription_plans` is the source of truth for what each plan unlocks — the application reads this in MB-116 to gate content
- `stripe_price_id` is NULL on all three plans — this is expected and will be populated in MB-116 after Stripe products are created
- Do not hard-code the KSI trader_id, portal_id, or plan IDs anywhere in application code — always query by slug or plan slug
