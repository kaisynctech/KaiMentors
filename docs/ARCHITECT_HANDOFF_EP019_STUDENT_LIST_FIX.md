# Architect Handoff — EP-019: Student List Fix
**Status:** Ready for Engineering  
**Date:** 2026-06-25  
**Product Owner:** KaiMentors Product Owner

---

## Objective

Fix two bugs that make the mentor student list unusable after EP-015 (deferred broker verification):

1. **Student table shows 0 results** — `get_student_applications_page` uses `INNER JOIN` on `trader_broker_accounts`. EP-015 made `trader_broker_account_id` nullable. Any student who registered without selecting a broker (all of them, post EP-015) is excluded by the inner join. The stats cards are correct (they use direct `student_applications` counts). Only the paginated table is broken.

2. **Student display name shows mentor account name** — The RPC pulls `profile.full_name` from the `profiles` table. For existing users who register as students via the EP-016/EP-017 existing-user path, the register route never saves the name they typed into the form. Their profile name is whatever their mentor or platform account was set up with (e.g. "Milkers FX Owner"). The name from the registration form is discarded.

---

## Scope of Changes

### 1. Database Migration (Migration 031)

**A — Change INNER JOINs to LEFT JOINs in `get_student_applications_page`.**

The current RPC body:
```sql
join public.trader_broker_accounts connection
  on connection.id = application.trader_broker_account_id
  and connection.trader_id = application.trader_id
join public.brokers broker
  on broker.id = connection.broker_id
```

Replace with:
```sql
left join public.trader_broker_accounts connection
  on connection.id = application.trader_broker_account_id
  and connection.trader_id = application.trader_id
left join public.brokers broker
  on broker.id = connection.broker_id
```

Also update the broker and method filter conditions so they skip gracefully when `connection` or `broker` is NULL:
```sql
-- BEFORE
and (
  target_broker_id is null
  or broker.id = target_broker_id
)
and (
  target_verification_method is null
  or connection.verification_method = target_verification_method
)

-- AFTER (unchanged logic — NULL broker rows naturally fail the equality check,
-- which is correct: if target_broker_id is set, only show matching rows;
-- if target_broker_id is null, show all rows including those with no broker)
-- No change needed to these filter lines — they already handle NULL correctly
-- because NULL = any_value is false in SQL, so NULL rows pass through when
-- target_broker_id IS NULL and are excluded when target_broker_id IS NOT NULL.
```

No change to the filter WHERE conditions is required — SQL NULL comparison semantics handle this correctly.

**B — Add `full_name` to `student_applications`.**

```sql
ALTER TABLE public.student_applications
  ADD COLUMN full_name TEXT NULL;
```

**C — Update `get_student_applications_page` to use the student's registered name.**

In the SELECT list, replace:
```sql
profile.full_name,
```

With:
```sql
coalesce(application.full_name, profile.full_name) as full_name,
```

No change to the return type declaration is needed — `full_name` is already returned as `text`.

Also update the free-text search condition to search both names:
```sql
-- BEFORE
or concat_ws(
  ' ',
  profile.full_name,
  ...
) ilike ...

-- AFTER
or concat_ws(
  ' ',
  coalesce(application.full_name, profile.full_name),
  ...
) ilike ...
```

Full updated RPC (replace entire function body — use `CREATE OR REPLACE`):

```sql
DROP FUNCTION IF EXISTS public.get_student_applications_page(
  uuid, public.verification_status[], uuid, public.verification_method, text, int, int
);

CREATE OR REPLACE FUNCTION public.get_student_applications_page(
  target_trader_id uuid,
  target_statuses public.verification_status[] DEFAULT NULL,
  target_broker_id uuid DEFAULT NULL,
  target_verification_method public.verification_method DEFAULT NULL,
  target_search text DEFAULT NULL,
  target_limit int DEFAULT 25,
  target_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  status public.verification_status,
  status_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_version int,
  phone_number text,
  trading_account_number text,
  platform_account_number text,
  screenshot_path text,
  full_name text,
  email text,
  phone text,
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
  uuid, public.verification_status[], uuid, public.verification_method, text, int, int
) TO authenticated;
```

> **Note to Engineering:** Before writing the DROP/CREATE, verify the exact current function signature (parameter names and types) from `\df get_student_applications_page` in psql or from the migration file, to ensure the DROP matches exactly.

---

### 2. `app/api/student/register/route.ts`

Save `full_name` in the `student_applications` insert for both the new-user path and the existing-user path.

**New-user insert** (line ~182):
```typescript
// Add to the insert object:
full_name: input.fullName,
```

**Existing-user insert** (line ~156):
```typescript
// Add to the insert object:
full_name: input.fullName,
```

---

### 3. TypeScript — `app/dashboard/students/page.tsx`

The `QueueRecord` interface declares `broker_id` and `broker_name` as non-nullable strings. After the LEFT JOIN fix they can be null. Update:

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

Any component downstream that renders `broker_name` or `verification_method` must handle null gracefully (e.g. show "—" or "No broker assigned" when null). Engineering should grep for all uses of these fields in the student review components.

---

### 4. `lib/database.types.ts`

After the migration is applied, regenerate types (`supabase gen types typescript`) so the `student_applications` table type reflects the new `full_name` column. If auto-generation is not part of the Engineering workflow, update the type manually:

```typescript
student_applications: {
  Row: {
    // ... existing fields ...
    full_name: string | null  // ADD
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

- The stats cards in the students page (they query `student_applications` directly — already correct).
- RLS policies — no change.
- Student portal — no change.
- EP-018 — no change.

---

## Acceptance Criteria

1. The TC mentor students page shows both pending students in the table (not "No matching students").
2. The display name for a student who registered via the existing-user path shows the name they entered in the registration form, not their platform account name.
3. Students with no broker linked show a null/empty broker column in the table — no error, no crash.
4. Broker and method filters still work correctly for students who DO have a broker linked.
5. Free-text search finds students by the name they registered with.
6. `npm run typecheck` and `npm run build` pass with no new errors.
7. Existing acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

- Migration 031 applied: `full_name` column added to `student_applications`, `get_student_applications_page` updated (LEFT JOIN + COALESCE name)
- Register route updated: `full_name` saved in both new-user and existing-user inserts
- `QueueRecord` TypeScript interface updated; all null broker fields handled in UI
- `database.types.ts` updated
- Acceptance criteria 1–7 verified against KaiTrades and Traders Confidence
- Commit hash and files changed
