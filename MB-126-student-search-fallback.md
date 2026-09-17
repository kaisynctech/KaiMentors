# MB-126 — Student Search: Fallback Degradation & `broker_verified` Gap

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-28  
**Scope:** Mentor dashboard — `/app/dashboard/students/page.tsx`, `get_student_applications_page` RPC

---

## 1. Context

The students page has two code paths:

**Primary path** — `get_student_applications_page` RPC. Searches name, email, phone, and account numbers via a `CONCAT_WS + ILIKE` clause across the joined `profiles` and `student_applications` tables. This is correct and complete.

**Fallback path** — activated when the RPC call returns an error (meaning the migration hasn't been applied to the remote Supabase project yet). It runs a direct PostgREST query against `student_applications`. The comment in the code reads: `"Keep the page usable before the local migration is applied remotely."`

The fallback has two bugs:

---

## 2. Bug 1 — Fallback search silently drops name and email

### Current fallback search filter

```ts
if (search) {
  fallback = fallback.or(
    `phone_number.ilike.%${search}%,trading_account_number.ilike.%${search}%,platform_account_number.ilike.%${search}%`,
  );
}
```

This searches only `phone_number`, `trading_account_number`, and `platform_account_number`. A mentor searching for a student by name or email while the platform is in fallback mode sees zero results — with no indication that the search is incomplete. The search box placeholder still reads "Search name, email, phone, or account", so the mentor assumes name/email search works.

### Root cause

PostgREST's `.or()` filter can only reference columns on the base table. `email` lives on `profiles` (a joined table), so it cannot appear in a `.or()` clause on `student_applications`. `full_name` IS a direct column on `student_applications` — it was added in migration `202606250031` — but the fallback was written before that migration and was never updated.

### Fix — two-part

**Part A: Add `full_name` to the fallback `.or()` filter.**

`full_name` is a direct column on `student_applications` (added in `202606250031_student_list_fix.sql`). It can be included in the existing `.or()` string:

```ts
if (search) {
  fallback = fallback.or(
    `full_name.ilike.%${search}%,phone_number.ilike.%${search}%,trading_account_number.ilike.%${search}%,platform_account_number.ilike.%${search}%`,
  );
}
```

This restores name search in fallback mode.

**Part B: Add email search to the fallback via a pre-query.**

Email lives on `profiles`. PostgREST cannot filter on a joined table in `.or()`, but a pre-query can resolve matching user IDs first:

```ts
// Run alongside the fallback query, not blocking it
const { data: emailMatches } = await supabase
  .from("profiles")
  .select("id")
  .ilike("email", `%${search}%`)
  .eq("trader_id", traderId); // assuming profiles has trader_id; if not, skip this filter
  // If profiles has no trader_id column, omit the eq() — results may include other-trader profiles
  // but the main fallback query's .eq("trader_id", traderId) will filter them out anyway

const emailMatchIds = emailMatches?.map(p => p.id) ?? [];
```

Then extend the fallback filter to include these IDs:

```ts
if (search) {
  fallback = fallback.or(
    `full_name.ilike.%${search}%,phone_number.ilike.%${search}%,trading_account_number.ilike.%${search}%,platform_account_number.ilike.%${search}%${
      emailMatchIds.length > 0
        ? `,student_user_id.in.(${emailMatchIds.join(",")})`
        : ""
    }`,
  );
}
```

**Important:** Verify the `profiles` table structure before implementing Part B. Check whether `profiles` has a `trader_id` column. If it does not, the pre-query will return profiles from all traders — this is acceptable because the outer `student_applications.trader_id = traderId` filter will discard non-matching rows. If the profiles table has many thousands of rows, limit the pre-query:

```ts
.ilike("email", `%${search}%`).limit(200)
```

200 IDs in the `.in()` filter is well within PostgREST limits.

**Part C: Add a visible warning when the fallback is active.**

The mentor currently has no idea the page is in fallback mode. Add a dismissible banner at the top of the student list when `queueResult.error` triggered the fallback:

```tsx
{isFallback && (
  <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
    ⚠ Search is running in limited mode — a database migration is pending.
    Name and email search may not return all results.
    Contact support if this persists.
  </div>
)}
```

Pass `isFallback` as a prop to `<StudentReviewList>` (or whatever the list component is named) and render the banner above the search bar. The banner should not appear in normal operation.

---

## 3. Bug 2 — `broker_verified` missing from RPC RETURNS TABLE

### Current state

Migration `202607081800_student_access_policy.sql` added a `broker_verified` column to `student_applications`. The TypeScript `QueueRecord` interface (in `lib/students.ts` or inline in `page.tsx`) includes `broker_verified`. But the `get_student_applications_page` RPC's `RETURNS TABLE` declaration was never updated — `broker_verified` is not in the SELECT list and not declared in RETURNS TABLE.

Result: when the primary RPC path is active (normal operation), every `QueueRecord` row has `broker_verified: undefined` at runtime. The TypeScript cast `(queueResult.data ?? []) as QueueRecord[]` silently masks this. The fallback path does return `broker_verified` directly from `student_applications`, so this column only works in fallback mode — the opposite of what should be true.

### Fix — RPC migration update

Add `broker_verified` to the RPC's RETURNS TABLE and SELECT:

```sql
-- Migration: mb126_rpc_add_broker_verified
CREATE OR REPLACE FUNCTION public.get_student_applications_page(
  target_trader_id uuid,
  target_statuses public.verification_status[] DEFAULT NULL,
  target_search text DEFAULT NULL,
  target_broker_id uuid DEFAULT NULL,
  target_verification_method public.verification_method DEFAULT NULL,
  target_limit integer DEFAULT 25,
  target_offset integer DEFAULT 0
)
RETURNS TABLE (
  id                        uuid,
  status                    public.verification_status,
  status_reason             text,
  submitted_at              timestamptz,
  reviewed_at               timestamptz,
  review_version            integer,
  phone_number              text,
  trading_account_number    text,
  platform_account_number   text,
  screenshot_path           text,
  full_name                 text,
  email                     text,
  phone                     text,
  broker_id                 uuid,
  broker_name               text,
  verification_method       public.verification_method,
  trading_level             text,
  broker_verified           boolean,   -- ADD THIS
  total_count               bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
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
    application.broker_verified,       -- ADD THIS
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
    AND (public.is_super_admin() OR public.is_trader_member(target_trader_id))
    AND (target_statuses IS NULL OR application.status = ANY(target_statuses))
    AND (target_broker_id IS NULL OR broker.id = target_broker_id)
    AND (target_verification_method IS NULL OR connection.verification_method = target_verification_method)
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
```

**Before writing this migration**, verify the full current RETURNS TABLE against the live DB to confirm no other columns have been added since `202606250031` that are also missing:

```sql
select proretset, prosrc
from pg_proc
where proname = 'get_student_applications_page'
  and pronamespace = 'public'::regnamespace;
```

Compare the column list there to the `QueueRecord` interface in the application code. Add any other missing columns in the same migration rather than separate ones.

---

## 4. Fallback Removal — Long-Term Note

The fallback path exists specifically for the deployment window between code deploy and migration apply. Once the RPC is consistently applied before or alongside code deploys (via Supabase CLI migration apply in CI, for example), the fallback can be removed. For now, fixing it to be complete is the right approach. A future brief can address the deployment process.

---

## 5. Testing Checklist

### Bug 1 (fallback search)

Testing the fallback requires temporarily breaking the RPC — the easiest way is to rename it or drop it in a test/dev environment, then run the fallback path:

- [ ] With fallback active and search term = a student's full name: matching student appears.
- [ ] With fallback active and search term = a student's email address: matching student appears.
- [ ] With fallback active and search term = a phone number: matching student appears.
- [ ] Warning banner is visible when fallback is active.
- [ ] No warning banner when the RPC is working normally.

### Bug 2 (`broker_verified`)

- [ ] Migration applies cleanly.
- [ ] After migration: inspect a raw RPC response row in the network tab — `broker_verified` field is present (true/false, not missing).
- [ ] In the students list, any UI element that depends on `broker_verified` (badge, filter, indicator) renders correctly.
- [ ] `tsc --noEmit` exits clean.

---

## 6. Implementation Order

1. Check `pg_proc` for the full current RETURNS TABLE — identify all missing columns vs `QueueRecord`.
2. Write + apply the RPC migration (`CREATE OR REPLACE`) adding `broker_verified` (and any other missing columns).
3. Verify RPC response in the network tab — confirm `broker_verified` is present.
4. Update the fallback search `.or()` string to include `full_name`.
5. Implement the `profiles` email pre-query for fallback email search.
6. Pass `isFallback` prop to the list component and render the warning banner.
7. Run `tsc --noEmit`.
