# MB-118 — PayFast Subscription Gating + Student Portal Auth Fix

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** KSI portal (and any future `access_model = "subscription"` portal)

---

## 1. Context & Problem

The platform has an `access_model` column on the `portals` table. KSI's portal is (or must be set to) `"subscription"`. However, the student access decision function `hasStudentModuleAccess()` in `/lib/student-access.ts` completely ignores this field — it gates on broker verification regardless. KSI students will never get broker verified, so they register and remain locked forever.

Additionally, the sign-out links in the course and lesson pages (`/app/student/courses/[courseId]/page.tsx` and the lesson player) are plain `<Link href="/auth/signout">` tags. The sign-out route (`/app/auth/signout/route.ts`) only accepts POST. These links do nothing on click, leaving students unable to sign out.

---

## 2. Goal

1. Students on a subscription portal register → see a locked dashboard showing pricing plans.
2. They pay via PayFast recurring checkout → PayFast ITN webhook fires → access unlocks automatically.
3. Students can cancel their subscription from the dashboard → access remains until the end of the current billing period, then locks again.
4. Sign-out works correctly from all student pages.

---

## 3. Database Changes

### 3a. New table: `student_subscriptions`

```sql
create table public.student_subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  student_application_id    uuid not null references public.student_applications(id) on delete cascade,
  student_user_id           uuid not null references auth.users(id) on delete cascade,
  trader_id                 uuid not null,
  portal_id                 uuid not null,
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

-- Index for fast lookup by student
create index on public.student_subscriptions (student_user_id, status);
create index on public.student_subscriptions (payfast_token);

-- RLS
alter table public.student_subscriptions enable row level security;

-- Students can read their own rows
create policy "student_read_own"
  on public.student_subscriptions for select
  to authenticated
  using (student_user_id = auth.uid());

-- Service role manages all (webhook + admin)
```

### 3b. Verify KSI portal `access_model`

Run once on the KSI portal row:

```sql
update public.portals
set access_model = 'subscription'
where slug = 'kaisync-institution';   -- confirm the exact slug
```

Verify it is set before proceeding.

---

## 4. PayFast Account Setup (Manual — Nyarie to do)

Before any code is written, the following must exist in the PayFast merchant portal (https://www.payfast.co.za):

1. **Merchant account** verified and approved.
2. **ITN URL** configured to: `https://kaimentors.com/api/webhooks/payfast` (or the custom domain if KSI has one). This must be a publicly reachable HTTPS URL — not localhost.
3. **Sandbox credentials** for development: `merchant_id` and `merchant_key` from the PayFast sandbox (https://sandbox.payfast.co.za).
4. Three subscription products do **not** need to be pre-created in PayFast — each checkout initiation defines the plan inline.

### Environment Variables Required

Add to `.env.local` (and Vercel environment settings):

```
PAYFAST_MERCHANT_ID=         # from PayFast dashboard
PAYFAST_MERCHANT_KEY=        # from PayFast dashboard
PAYFAST_PASSPHRASE=          # set in PayFast dashboard > Settings > Passphrase
PAYFAST_SANDBOX=true         # set to false in production
```

---

## 5. Plan Configuration

Define in a new file `/lib/subscription-plans.ts` (no database table needed — plans are static):

```
Plan ID       | Label          | Amount (ZAR) | Amount (cents)
--------------|----------------|--------------|---------------
basic         | Basic          | R 250.00     | 25000
intermediate  | Intermediate   | R 400.00     | 40000
pro           | Pro            | R 700.00     | 70000
```

Each plan gives full access to course content (same `hasModuleAccess = true`). Feature differentiation between plans (e.g. live classes only on Intermediate+, mentorship only on Pro) is a future enhancement — not in scope here. For now, any active subscription = full access.

---

## 6. Implementation

### 6a. `/lib/subscription-plans.ts` (new file)

```typescript
export const SUBSCRIPTION_PLANS = [
  {
    id: 'basic' as const,
    label: 'Basic',
    amountZAR: 250,
    amountCents: 25000,
    description: 'Full course access, AI Tools directory, community, self-paced learning',
    features: ['Full access to all courses', 'AI Tools directory', 'Community access', 'Self-paced learning'],
  },
  {
    id: 'intermediate' as const,
    label: 'Intermediate',
    amountZAR: 400,
    amountCents: 40000,
    description: 'Everything in Basic plus live classes and project workshops',
    features: ['Everything in Basic', 'Live classes', 'Group sessions', 'Project workshops'],
    popular: true,
  },
  {
    id: 'pro' as const,
    label: 'Pro',
    amountZAR: 700,
    amountCents: 70000,
    description: 'Everything in Intermediate plus one-on-one mentorship',
    features: ['Everything in Intermediate', 'One-on-one mentorship bookings', 'Priority support', 'Early access to new content'],
  },
] as const;

export type PlanId = typeof SUBSCRIPTION_PLANS[number]['id'];
```

---

### 6b. PayFast Utility `/lib/payfast.ts` (new file)

This file handles signature generation and ITN validation. Key points:

**Signature generation:**  
MD5 hash of all non-empty parameters sorted alphabetically by key, joined as `key=value&...`, with the passphrase appended as `&passphrase=...` before hashing.

**ITN validation steps** (must all pass before trusting the notification):
1. Reconstruct the parameter string from the POST body (excluding `signature`), append passphrase, MD5 it — must match the received `signature`.
2. Check `payment_status === "COMPLETE"`.
3. Verify the amount: `parseFloat(amount_gross)` must equal the expected plan amount within tolerance (±R0.01).
4. Make a server-side GET request to `https://sandbox.payfast.co.za/eng/query/validate` (or production URL) with the full POST body — must return `"VALID"`.
5. Check that `m_payment_id` matches a real `student_subscriptions.id` row in `pending` status.

The file should export:
- `buildPayFastFormFields(params)` → returns an object of all fields + computed signature, ready for an HTML form POST
- `validateITN(body: Record<string, string>)` → async, returns `{ valid: boolean; reason?: string }`
- `cancelSubscription(token: string)` → calls PayFast management API `PUT /subscriptions/{token}/cancel`
- `fetchSubscription(token: string)` → calls PayFast management API `GET /subscriptions/{token}/fetch`

PayFast sandbox base URL: `https://sandbox.payfast.co.za/eng/process`  
PayFast production base URL: `https://www.payfast.co.za/eng/process`  
Read from `PAYFAST_SANDBOX` env var.

---

### 6c. Checkout Initiation `/api/student/subscribe/route.ts` (new file)

**Method:** POST  
**Auth:** Requires authenticated student session.  
**Body:** `{ planId: 'basic' | 'intermediate' | 'pro', portalSlug: string }`

Steps:
1. Load the student's `student_applications` row + portal. Verify `access_model === "subscription"`.
2. Verify no existing `active` subscription exists for this student on this portal.
3. Create a `student_subscriptions` row with `status = "pending"`, `plan_id`, `amount_cents`, `trader_id`, `portal_id`. Store the generated `id` — this becomes `m_payment_id`.
4. Build PayFast form fields:
   - `merchant_id`, `merchant_key`
   - `return_url` → `{portalBasePath}/dashboard?subscribed=1`
   - `cancel_url` → `{portalBasePath}/dashboard?cancelled=1`
   - `notify_url` → `https://kaimentors.com/api/webhooks/payfast`
   - `name_first`, `name_last`, `email_address` → from student profile
   - `m_payment_id` → `student_subscriptions.id`
   - `amount` → plan amount e.g. `"250.00"`
   - `item_name` → e.g. `"KaiSync Institution – Basic Plan"`
   - `subscription_type` → `"1"`
   - `billing_date` → today's date `YYYY-MM-DD`
   - `recurring_amount` → same as `amount`
   - `frequency` → `"3"` (monthly)
   - `cycles` → `"0"` (indefinite)
   - `custom_str1` → `student_subscriptions.id` (redundant safety check in ITN)
5. Return `{ fields: {...}, actionUrl: "https://sandbox.payfast.co.za/eng/process" }` to the client.
6. The client renders a hidden form and auto-submits it (POST redirect to PayFast).

---

### 6d. ITN Webhook `/api/webhooks/payfast/route.ts` (new file)

**Method:** POST (PayFast posts `application/x-www-form-urlencoded`)  
**Auth:** None (public endpoint) — validated by signature check.  
**Must respond with HTTP 200 within 10 seconds.**

Steps:
1. Parse body as URLSearchParams → plain object.
2. Call `validateITN(body)`. If invalid, log the reason and return `200 OK` (always return 200 to PayFast — retrying invalid requests wastes attempts).
3. Find `student_subscriptions` row by `id = body.m_payment_id`.
4. **On `payment_status === "COMPLETE"`:**
   - Update `student_subscriptions`:
     - `status = "active"`
     - `payfast_token = body.token`
     - `payfast_payment_id = body.pf_payment_id`
     - `current_period_start = now()`
     - `current_period_end = now() + 30 days`
     - `updated_at = now()`
   - Update `student_applications`:
     - `status = "verified"` (this triggers `hasModuleAccess = true` immediately)
   - Return 200.
5. **On `payment_status === "CANCELLED"`:**
   - Update `student_subscriptions`: `status = "cancelled"`, `cancelled_at = now()`.
   - Update `student_applications`: `status = "pending"` (revoke access).
   - Return 200.
6. **On `payment_status === "FAILED"`:**
   - Update `student_subscriptions`: `status = "payment_failed"`.
   - Do not revoke access immediately (grace period — PayFast will retry).
   - Return 200.

**Note on `current_period_end`:** PayFast does not send renewal ITNs for each billing cycle in the basic setup. Set `current_period_end = now() + 32 days` (2-day buffer) on each COMPLETE notification. If a renewal payment fails, the CANCELLED or FAILED ITN will eventually fire. For a more robust setup, a daily cron job can call `fetchSubscription(token)` to sync status — but that is out of scope for this brief.

---

### 6e. Access Gating Logic Update `/lib/student-access.ts`

Update `hasStudentModuleAccess()` to add a subscription path.

**New function signature needs a new parameter: `activeSubscription: boolean`**

Update `loadStudentSessionContext()` in `/lib/student-access-server.ts` to:
1. After loading the application + portal, check `portal.access_model`.
2. If `access_model === "subscription"`:
   - Query `student_subscriptions` where `student_user_id = userId`, `portal_id = portal.id`, `status = "active"`, `current_period_end > now()`.
   - Set `hasModuleAccess = !!activeSubscription`.
   - Skip the broker verification check entirely.
3. If `access_model !== "subscription"`: existing broker verification logic unchanged.

Also add `activeSubscription` (the full row or null) to the returned context so the dashboard can show the current plan and a cancel button.

---

### 6f. Locked Dashboard UI for Subscription Portals

In `/app/student/page.tsx`, when `hasModuleAccess === false` AND `accessModel === "subscription"`, render a subscription paywall instead of the broker form.

The paywall component (`<SubscriptionPaywall>` — new client component) must:

1. Display three plan cards (Basic, Intermediate, Pro) using `SUBSCRIPTION_PLANS`.
2. Each card shows: plan name, price/month, feature list, "Subscribe" button. Intermediate card is highlighted as "Most Popular".
3. On "Subscribe" click: POST to `/api/student/subscribe` with `{ planId, portalSlug }`, receive back `{ fields, actionUrl }`, build a hidden form, and auto-submit it (redirects user to PayFast checkout).
4. Show a loading state while initiating.
5. On return from PayFast with `?subscribed=1` in the URL: show a "Payment received — your access is being activated" banner. The ITN webhook may take up to 30 seconds to fire. Poll `GET /api/student/subscription-status` every 5 seconds for up to 60 seconds, then reload the page when `status === "active"`.

The current status card (showing "pending / processing / verified") should only render for broker-verification portals, not subscription portals.

---

### 6g. Subscription Status + Cancel `/api/student/subscription-status/route.ts` (new)

**GET:** Returns `{ status, planId, currentPeriodEnd, payfastToken }` for the authenticated student's active subscription on their portal.

Used by the paywall polling loop and the dashboard "My Subscription" widget.

---

### 6h. Cancel Subscription

Add a "My Subscription" card to the student dashboard (visible when `hasModuleAccess === true` and `accessModel === "subscription"`). Shows:
- Current plan name and price
- Next billing date (`current_period_end`)
- "Cancel subscription" button

On cancel:
1. Client posts to `/api/student/cancel-subscription` (new POST route).
2. API calls `cancelSubscription(payfast_token)` via PayFast management API.
3. Updates `student_subscriptions.status = "cancelled"`, `cancelled_at = now()`.
4. Does **not** revoke access immediately — student keeps access until `current_period_end`.
5. Dashboard shows "Cancellation confirmed. Access continues until {date}." message.
6. After `current_period_end` passes, `hasModuleAccess` returns false on next page load (the `current_period_end > now()` check in 6e handles this).

**PayFast cancel management API call:**
```
PUT https://api.payfast.co.za/subscriptions/{token}/cancel
Headers:
  merchant-id: {PAYFAST_MERCHANT_ID}
  version: v1
  timestamp: {ISO8601 timestamp}
  signature: {MD5 of merchant-id + passphrase + timestamp}
```

---

## 7. Sign-Out Fix

**Problem:** `/app/student/courses/[courseId]/page.tsx` and `/app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` both render sign-out as a plain `<Link href="/auth/signout">`. The route is POST-only — these links do nothing.

**Fix:** Create a reusable client component `/components/sign-out-button.tsx`:

```tsx
"use client";
import { useRef } from "react";

export function SignOutButton({ returnTo, children }: { returnTo: string; children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} method="POST" action="/auth/signout" style={{ display: "none" }}>
        <input type="hidden" name="returnTo" value={returnTo} />
      </form>
      <button type="button" onClick={() => formRef.current?.submit()}>
        {children}
      </button>
    </>
  );
}
```

Replace every `<Link href="/auth/signout">` in the student portal with:
```tsx
<SignOutButton returnTo={`${basePath}/login`}>Sign out</SignOutButton>
```

`basePath` is already available in context on every student page. On custom domains, the sign-out route already overrides `returnTo` to `/login` — so the student lands on their portal's login page correctly.

Pages to update:
- `/app/student/courses/[courseId]/page.tsx`
- `/app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`
- Any other page in `/app/student/` or `/app/academy/` that renders a sign-out link directly

---

## 8. Implementation Order

The developer must follow this order — each step depends on the previous:

1. ✅ Add `PAYFAST_*` env vars (Nyarie sets these in Vercel + .env.local).
2. Create `student_subscriptions` table migration.
3. Verify KSI portal `access_model = "subscription"` in DB.
4. Create `/lib/subscription-plans.ts`.
5. Create `/lib/payfast.ts` (signature + ITN validation + management API calls).
6. Create `/api/student/subscribe/route.ts` (checkout initiation).
7. Create `/api/webhooks/payfast/route.ts` (ITN handler).
8. Create `/api/student/subscription-status/route.ts`.
9. Create `/api/student/cancel-subscription/route.ts`.
10. Update `/lib/student-access.ts` + `/lib/student-access-server.ts` (gating logic).
11. Create `<SubscriptionPaywall>` component.
12. Update `/app/student/page.tsx` (paywall branch + My Subscription card).
13. Create `<SignOutButton>` component.
14. Replace sign-out links in course + lesson pages.

---

## 9. Testing Checklist

Use PayFast sandbox (https://sandbox.payfast.co.za) for all tests before going live.

- [ ] Student registers on KSI portal → lands on locked dashboard → sees three plan cards.
- [ ] Clicking "Subscribe – Basic" redirects to PayFast sandbox checkout.
- [ ] Complete sandbox payment → ITN fires → `student_subscriptions.status = "active"` → `student_applications.status = "verified"`.
- [ ] Student dashboard unlocks within 60 seconds of payment.
- [ ] "My Subscription" card shows correct plan name + next billing date.
- [ ] Cancel subscription → PayFast confirms → `student_subscriptions.status = "cancelled"` → dashboard shows "Access until {date}".
- [ ] After `current_period_end`, student is locked again.
- [ ] Sign-out button works on course page (custom domain and platform domain).
- [ ] Sign-out button works on lesson player page.
- [ ] Custom-domain sign-out redirects to `/login` on the custom domain.
- [ ] Failed payment ITN does not immediately revoke access.

---

## 10. Out of Scope (Future MBs)

- Differentiating features by plan tier (live classes gated to Intermediate+, mentorship to Pro only).
- Email notifications for payment confirmed, cancellation, payment failed.
- Admin dashboard view of student subscriptions + manual override.
- PayFast subscription pause/unpause.
- Prorated upgrades/downgrades between plans.
- Daily cron job to sync subscription status via `fetchSubscription` API.
