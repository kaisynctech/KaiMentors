# EP-019 Engineering Prompt — Student List Fix

**Status:** Ready for Engineering  
**Date:** 2026-06-25  
**Depends on:** EP-015 (Deferred Broker Verification) — already deployed  
**Migration:** 031

---

## Objective

Fix two bugs that make the mentor student list unusable after EP-015 made `trader_broker_account_id` nullable:

1. **Table shows 0 results.** `get_student_applications_page` uses `INNER JOIN` on `trader_broker_accounts`. Any student who registered without selecting a broker (all of them after EP-015) is excluded. The stats cards are unaffected — they query `student_applications` directly.

2. **Wrong display name for existing users.** For students who registered via the EP-016/EP-017 existing-user path, the register route never persisted the name they typed into the form. The RPC returns whatever their existing platform account name is (e.g. "Milkers FX Owner") instead of the name they registered with.

---

## Pre-Implementation Investigation

Before writing any code, confirm the following:

1. `supabase/migrations/202606240027_student_onboarding_trading_fields.sql` — read the full DROP and CREATE for `get_student_applications_page`. Confirm the current parameter order: `target_trader_id uuid, target_statuses verification_status[], target_search text, target_broker_id uuid, target_verification_method verification_method, target_limit integer, target_offset integer`. Confirm the current RETURNS TABLE column names: `application_id`, `application_status`, `student_name`, `student_email`, `profile_phone`. The DROP in migration 031 must match this signature exactly.

2. `app/dashboard/students/page.tsx` — confirm `QueueRecord` interface has `broker_id: string`, `broker_name: string`, `verification_method: VerificationMethod` as non-nullable. Confirm the fallback path at lines ~182–218 assigns `broker_id: connection?.broker_id ?? ""`, `broker_name: broker?.name ?? "Broker unavailable"`, `verification_method: ... ?? "manual_review"`.

3. `lib/students.ts` — confirm `StudentApplicationRow` has `brokerId: string`, `brokerName: string`, `verificationMethod: VerificationMethod` as non-nullable.

4. `components/student-review-list.tsx` — locate `formatMethod(application.verificationMethod)` and `formatMethod(detail.verificationMethod)`. Confirm `formatMethod` is typed to accept non-null `VerificationMethod`. These calls will TypeScript-error after the type changes.

Report these findings before touching any file.

---

## Change 1 — Database Migration 031

File: `supabase/migrations/202606250031_student_list_fix.sql`

### 1a — Add `full_name` column to `student_applications`

```sql
ALTER TABLE public.student_applications
  ADD COLUMN full_name TEXT NULL;
```

### 1b — Drop and recreate `get_student_applications_page`

The DROP must match the current function signature exactly (parameter order from migration 027):

```sql
DROP FUNCTION IF EXISTS public.get_student_applications_page(
  uuid,
  public.verification_status[],
  text,
  uuid,
  public.verification_method,
  integer,
  integer
);
```

Recreate with LEFT JOINs, COALESCE for student name, and updated search:

```sql
CREATE FUNCTION public.get_student_applications_page(
  target_trader_id uuid,
  target_statuses public.verification_status[] DEFAULT NULL,
  target_search text DEFAULT NULL,
  target_broker_id uuid DEFAULT NULL,
  target_verification_method public.verification_method DEFAULT NULL,
  target_limit integer DEFAULT 25,
  target_offset integer DEFAULT 0
)
RETURNS TABLE (
  application_id uuid,
  application_status public.verification_status,
  status_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_version integer,
  phone_number text,
  trading_account_number text,
  platform_account_number text,
  screenshot_path text,
  student_name text,
  student_email text,
  profile_phone text,
  broker_id uuid,
  broker_name text,
  verification_method public.verification_method,
  trading_level text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    application.id,
    application.status,
    application.status_reason,
    application.submitted_at,
    application.reviewed_at,
    application.review_version,
    application.phone_number,
    application.trading_account_number,
    application.platform_account_number,
    application.screenshot_path,
    COALESCE(application.full_name, profile.full_name),
    profile.email,
    profile.phone,
    broker.id,
    broker.name,
    connection.verification_method,
    application.trading_level,
    COUNT(*) OVER()
  FROM public.student_applications application
  JOIN public.profiles profile
    ON profile.id = application.student_user_id
  LEFT JOIN public.trader_broker_accounts connection
    ON connection.id = application.trader_broker_account_id
    AND connection.trader_id = application.trader_id
  LEFT JOIN public.brokers broker
    ON broker.id = connection.broker_id
  WHERE application.trader_id = target_trader_id
    AND (
      public.is_super_admin()
      OR public.is_trader_member(target_trader_id)
    )
    AND (
      target_statuses IS NULL
      OR application.status = ANY(target_statuses)
    )
    AND (
      target_broker_id IS NULL
      OR broker.id = target_broker_id
    )
    AND (
      target_verification_method IS NULL
      OR connection.verification_method = target_verification_method
    )
    AND (
      NULLIF(TRIM(target_search), '') IS NULL
      OR CONCAT_WS(
        ' ',
        COALESCE(application.full_name, profile.full_name),
        profile.email,
        profile.phone,
        application.phone_number,
        application.trading_account_number,
        application.platform_account_number
      ) ILIKE '%' || TRIM(target_search) || '%'
    )
  ORDER BY application.submitted_at DESC, application.id DESC
  LIMIT LEAST(GREATEST(target_limit, 1), 100)
  OFFSET GREATEST(target_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_student_applications_page(
  uuid, public.verification_status[], text, uuid, public.verification_method, integer, integer
) TO authenticated;
```

**Key changes vs current:**
- `JOIN public.trader_broker_accounts` → `LEFT JOIN`
- `JOIN public.brokers` → `LEFT JOIN`
- `profile.full_name` → `COALESCE(application.full_name, profile.full_name)` in both SELECT and CONCAT_WS
- All RETURNS TABLE column names are **unchanged** from migration 027

**NULL filter semantics:** No change to the `target_broker_id` and `target_verification_method` filter conditions. SQL NULL comparison (`NULL = any_value`) evaluates to NULL (not TRUE), so when `target_broker_id IS NOT NULL`, rows with no broker connection are naturally excluded from results — which is correct filter behaviour. When `target_broker_id IS NULL`, all rows including those with no broker pass through.

---

## Change 2 — `app/api/student/register/route.ts`

Save `full_name` in both student_applications inserts.

**New-user insert** (currently around line 182, `applicationId` insert):
```typescript
// Add to the insert object:
full_name: input.fullName,
```

**Existing-user insert** (currently around line 156, the `!existingApp` guard insert):
```typescript
// Add to the insert object:
full_name: input.fullName,
```

No other changes to this file.

---

## Change 3 — TypeScript: three files

### 3a — `app/dashboard/students/page.tsx`

Update `QueueRecord`:
```typescript
// BEFORE
broker_id: string;
broker_name: string;
verification_method: VerificationMethod;

// AFTER
broker_id: string | null;
broker_name: string | null;
verification_method: VerificationMethod | null;
```

Update the fallback path mapping (lines ~209–212) to return null instead of placeholder strings, so `QueueRecord` and `StudentApplicationRow` remain consistent:
```typescript
// BEFORE
broker_id: connection?.broker_id ?? "",
broker_name: broker?.name ?? "Broker unavailable",
verification_method: (connection?.verification_method as VerificationMethod) ?? "manual_review",

// AFTER
broker_id: connection?.broker_id ?? null,
broker_name: broker?.name ?? null,
verification_method: (connection?.verification_method as VerificationMethod | null) ?? null,
```

Update the mapping from `QueueRecord` to `StudentApplicationRow` (lines ~220–238) — `brokerId`, `brokerName`, `verificationMethod` are now passed as `string | null` / `VerificationMethod | null`. This will typecheck once `StudentApplicationRow` is updated in 3b.

### 3b — `lib/students.ts`

Update `StudentApplicationRow`:
```typescript
// BEFORE
brokerId: string;
brokerName: string;
verificationMethod: VerificationMethod;

// AFTER
brokerId: string | null;
brokerName: string | null;
verificationMethod: VerificationMethod | null;
```

### 3c — `components/student-review-list.tsx`

`formatMethod` currently accepts non-null `VerificationMethod`. There are two call sites that will typecheck-error after the type changes:

- Line ~482: `{formatMethod(application.verificationMethod)}`
- Line ~640: `{formatMethod(detail.verificationMethod)}`

Update both call sites to handle null:
```tsx
// BEFORE
{formatMethod(application.verificationMethod)}

// AFTER
{application.verificationMethod ? formatMethod(application.verificationMethod) : "—"}
```

Apply the same pattern to line ~627 `brokerName` renders for consistency (though these are already safe for React rendering of null):
```tsx
// BEFORE
<strong>{application.brokerName}</strong>
<dd>{detail.brokerName}</dd>

// AFTER
<strong>{application.brokerName ?? "—"}</strong>
<dd>{detail.brokerName ?? "—"}</dd>
```

---

## Change 4 — `lib/database.types.ts`

After the migration is applied, regenerate types:

```bash
supabase gen types typescript --project-id <project-id> > lib/database.types.ts
```

If auto-generation is not used in this workflow, manually add to `student_applications`:

```typescript
student_applications: {
  Row: {
    // ... existing fields ...
    full_name: string | null   // ADD
  }
  Insert: {
    full_name?: string | null  // ADD
  }
  Update: {
    full_name?: string | null  // ADD
  }
}
```

---

## What Is NOT Changing

- Stats cards in the students page (query `student_applications` directly — already correct).
- RLS policies.
- Student portal.
- EP-018 register route OTP logic — only the `full_name` field is added to the inserts.

---

## Acceptance Criteria

Test against KaiTrades (acceptance environment). Do not use Traders Confidence or Milkers FX as fixtures.

**Scenario 1 — Table now shows students**  
Open the KaiTrades mentor Students page. The table shows all registered students (not "No matching students"). Stat card counts match the table total count.

**Scenario 2 — Name from registration form appears**  
A student who registered via the existing-user path (e.g. a mentor email used at the student join page) shows the name they typed in the registration form — not their platform account name.

**Scenario 3 — Students with no broker show gracefully**  
Students who registered without a broker appear in the table. Broker and verification method columns show "—" (not an error, blank, or crash).

**Scenario 4 — Broker filter still works**  
If any student has a broker linked, the broker filter narrows the table correctly. Students with no broker do not appear when a specific broker is selected.

**Scenario 5 — Free-text search**  
Searching by the name entered in the registration form finds the correct student.

**Scenario 6 — Build and typecheck**  
`npm run typecheck` passes with no new errors.  
`npm run build` completes cleanly.

**Scenario 7 — Acceptance runner**  
Existing test suite passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

1. Pre-implementation investigation findings (current function parameter order and return column names confirmed against migration 027).
2. Migration 031 applied: `full_name` column added; `get_student_applications_page` recreated with LEFT JOINs, COALESCE name, updated search, original column names preserved.
3. Register route updated: `full_name` added to both new-user and existing-user inserts.
4. `QueueRecord` in `students/page.tsx` updated; fallback path returns null broker fields.
5. `StudentApplicationRow` in `lib/students.ts` updated.
6. `student-review-list.tsx` null guards added on `formatMethod` and broker name renders.
7. `database.types.ts` updated (regenerated or manually patched).
8. Acceptance criteria 1–7 verified against KaiTrades.
9. Commit hash and files changed.
