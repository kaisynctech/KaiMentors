# Engineering Prompt EP-015 — Signup Simplification & Dashboard Verification

**Issued by:** KaiMentors Enterprise Architect  
**Date:** 2026-06-24  
**Priority:** High  
**Depends on:** EP-014 (Student Portal Redesign) must be deployed — `StudentShell`, `BrokerGuideCard`, and `VerificationScreenshotUpload` must exist before this prompt is executed  
**Estimated scope:** Major — DB migration, form rewrite, new API route, Edge Function integration, security posture change

---

## ARCHITECT'S PRE-DELIVERY NOTES

The Product Owner handoff is architecturally sound. However, the Architect has identified **five corrections that must be incorporated** before Engineering begins. Implementing the handoff as-written without these corrections will cause a migration failure and an architecture violation.

**Correction 1 — Migration bug: `needs_more_information` is not a valid enum value.**  
The proposed migration 029 storage policy includes `'needs_more_information'::public.verification_status`. This enum value does not exist — confirmed in `docs/DATABASE.md` and the existing codebase. This cast will cause the migration to fail with a type error. The corrected policy must use only `'pending'::public.verification_status` and `'manual_review'::public.verification_status`.

**Correction 2 — Broker API verification must go through the Edge Function.**  
`docs/BROKER_INTEGRATIONS.md` states: "Supabase Edge Function `verify-broker-account` runs broker API checks server-side." The handoff's proposed `/api/student/verify` route describes calling broker adapters directly. This violates the existing architecture. Broker credentials, vault secrets, and adapter logic live exclusively inside the Edge Function — not in the Next.js API layer. The new verify route must invoke the Edge Function for API-type broker checks; it must not load adapter keys, call broker APIs, or read `api_config` directly. Engineering must read the Edge Function source in Supabase before writing the verify route.

**Correction 3 — `adapter_key` must not flow through the Next.js API layer.**  
The verify route should not SELECT `adapter_key` from `trader_broker_accounts` or `brokers`. That is an Edge Function internal. Pass connection IDs to the Edge Function and let it resolve its own configuration.

**Correction 4 — `partner_code` exposure is a deliberate security posture reversal from EP-014.**  
EP-014 explicitly built `get_student_broker_guide` to never return `partner_code` (security review sign-off was required in EP-014's acceptance criteria). The handoff now reverses this — students need the partner code to register with the broker. This is a legitimate business reason. Engineering must: (a) accept the change, (b) document it in `docs/BROKER_INTEGRATIONS.md` as a deliberate decision, (c) confirm that the SECURITY DEFINER gate still ensures only students with a valid application for the matching portal can read it.

**Correction 5 — Rate limiting is required on `/api/student/verify`.**  
The handoff does not mention rate limiting. An unauthenticated or authenticated student can call this endpoint repeatedly with different account numbers — this is a brute-force vector. Engineering must implement rate limiting: maximum 5 verification attempts per student per hour, tracked via the `verification_attempts` table (count rows by `application_id` within a rolling 60-minute window). Exceed the limit → return 429 with message "Too many verification attempts. Please wait before trying again."

---

## 1. Task Title

Signup Simplification and Dashboard Verification — Remove Broker Step from Registration, Add Active Verification from Student Portal

---

## 2. Business Objective

The current 4-step signup form requires students to select a broker and provide account details before they can complete registration. This creates a blocking UX problem: students without an account yet cannot get past Step 3.

This build eliminates the broker step from signup entirely. Students register in 3 steps (Profile → Experience → Review). Broker verification moves to the student portal dashboard, where the student explicitly submits their details and triggers verification when they have their account ready. The system attempts API verification across all active broker connections; if it fails or the broker uses manual review, the application moves to `manual_review` and the student sees the appropriate guidance.

---

## 3. Current State and Problems

**Read these files before touching anything:**
- `components/student-registration-form.tsx` — current 4-step form (lines 26–331)
- `app/api/student/register/route.ts` — current registration API
- `components/academy-join-page.tsx` — passes `brokers` prop to the form
- `lib/academy-entry.ts` — `AcademyEntryContext` type definition
- `components/broker-guide-card.tsx` — BrokerGuideCard from EP-014
- `components/verification-screenshot-upload.tsx` — VerificationScreenshotUpload from EP-014
- `app/student/page.tsx` — student dashboard from EP-014 (newly rewritten)
- `docs/BROKER_INTEGRATIONS.md`
- `docs/DATABASE.md`
- `docs/SECURITY.md`
- `docs/STUDENTS.md`

**Problems being solved:**

### 3a. Signup blocks unregistered students
Step 3 of the current form requires: a selected broker, "do you have an account?" = yes, a `tradingAccountNumber` (min 3 chars, required), and a `platformAccountNumber` (min 3 chars, required). Students who do not yet have an account cannot pass Step 3's `step3Valid` gate. This is the primary blocker.

### 3b. Verification at signup cannot be corrected
If a student provides wrong account details at signup, they have no way to update them from the portal. Dashboard verification gives them an explicit retry mechanism.

### 3c. `get_student_broker_guide` returns only one broker (LIMIT 1)
The EP-014 function returns only the first active broker connection. Mentors with multiple broker integrations are not surfaced to students. This must return all active connections.

### 3d. Students cannot see `partner_code` for broker registration
Students need the mentor's partner/referral code to register with the correct broker affiliation. EP-014 blocked this field. This handoff reverses that decision. See Correction 4 above.

### 3e. `get_student_broker_guide` blocks uploads from `pending` students
Migration 028's storage policy only allows resubmission uploads when status is `manual_review`. After this change, a new student starts with status `pending` and may want to upload a screenshot from the dashboard immediately. The storage policy must permit uploads from `pending` students.

---

## 4. Root Cause Investigation Requirements

Before writing any code, Engineering must:

1. **Read the Edge Function source.** Open the Supabase dashboard → Edge Functions → `verify-broker-account`. Read its entry point, adapter invocation pattern, expected request body, and response shape. This is mandatory before writing the verify API route. The Edge Function source is NOT in the Next.js repository — it is deployed separately to Supabase.

2. **Confirm DB constraint state.** Run:
   ```sql
   SELECT column_name, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'student_applications'
   AND column_name IN ('trader_broker_account_id', 'broker_account_identifier', 'verified_at');
   ```
   Confirm which columns are currently NOT NULL before writing the migration.

3. **Confirm `verification_status` enum values.** Run:
   ```sql
   SELECT enum_range(NULL::public.verification_status);
   ```
   The result must NOT include `needs_more_information`. Confirm before writing migration 029.

4. **Confirm `brokers` table columns.** Run:
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = 'brokers';
   ```
   Confirm `logo_path`, `adapter_key`, and `is_active` exist.

5. **Read the current `get_student_broker_guide` function.** Run:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'get_student_broker_guide';
   ```
   Read the full function body before replacing it.

6. **Confirm storage policy names.** Run:
   ```sql
   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
   ```
   Confirm the exact policy names from migration 028 before writing DROP POLICY statements.

7. **Grep for all callers of `StudentRegistrationForm`:**
   ```bash
   grep -r "StudentRegistrationForm" components/ app/
   ```
   Confirm only `academy-join-page.tsx` uses it.

8. **Grep for all callers of `get_student_broker_guide`:**
   ```bash
   grep -r "get_student_broker_guide" app/ lib/ components/
   ```
   Find every place the function is called — all callers must handle the new multi-row return shape.

9. **Read `app/student/page.tsx`** (EP-014 version). Identify where `BrokerGuideCard` is rendered and what props it currently receives. The dashboard verification form must extend this component — not duplicate it.

---

## 5. Existing Architecture to Respect

### Broker API verification stays in the Edge Function
`BROKER_INTEGRATIONS.md` is clear: "Broker APIs are never called from frontend code" and the Edge Function handles all broker API calls. The new verify route is an orchestration layer — it validates the request, checks rate limits, and calls the Edge Function. It does not call broker APIs directly.

### Multi-tenancy
`trader_id` must always be resolved from the student's application — never from a query parameter. The verify route resolves `trader_id` from `student_applications.trader_id` after verifying `student_user_id = auth.uid()`.

### Audit logging
All verification outcomes (verified, manual_review) must produce audit log entries consistent with the project's `write_audit_log` pattern.

### No temporary fixes
If the Edge Function needs to be extended to accept a new invocation mode (e.g., explicit account number without creating a new application), extend it correctly. Do not mock or stub broker verification logic.

### Registration rollback integrity
The current register route rolls back (deletes the created user) if any step fails. This pattern must be preserved in the simplified route. If the application insert fails, the auth user must be deleted.

---

## 6. Implementation Requirements

### 6a. Simplify `components/student-registration-form.tsx`

**Changes required:**

Remove the `brokers` prop and `RegistrationBroker` interface entirely. The form no longer receives broker data.

Change `STEPS` from `["Profile", "Experience", "Broker", "Review"]` to `["Profile", "Experience", "Review"]`.

Change `StepIndex` from `0 | 1 | 2 | 3` to `0 | 1 | 2`.

Remove all broker-related state: `selectedBrokerId`, `hasAccount`, `tradingAccountNumber`, `platformAccountNumber`, `screenshotFile`, `selectedBroker` (and the `useMemo` that computes it).

Remove the Step 3 JSX block (`{step === 2 && ...}`) entirely.

Remove hidden inputs: `brokerConnectionId`, `tradingAccountNumber`, `platformAccountNumber`.

Remove `screenshotFile` from FormData assembly (`formData.set("screenshotProof", screenshotFile)`).

Update `canNext`:
```typescript
const canNext = step === 0 ? step1Valid : step2Valid;
```

Update navigation logic. Currently `step < 3` shows Next and `step === 3` shows Submit. Change to `step < 2` and `step === 2`.

Update the Review step (now Step 2 → `step === 2`) consent checkbox text. The current text says "I consent to my account details being checked with the selected broker for verification purposes." This is no longer accurate — no broker is selected at signup. Change to:
> "I have read and understood the above. I consent to my trading account being verified against the academy's connected broker(s) when I submit my verification details from the student portal. I accept full responsibility for my own trading decisions."

Update Review step's "What happens next" paragraph to reflect the new flow — mention that they'll be asked to verify their broker account from the student portal.

Remove `ExternalLink` import (no longer used after broker step removal). Remove `UploadCloud` import (no longer used). Keep `ChevronLeft`, `ChevronRight`, `CheckCircle2`, `Loader2`.

### 6b. Simplify `components/academy-join-page.tsx`

Remove `brokers={data.brokers}` from the `<StudentRegistrationForm />` prop call. No other changes to this file.

### 6c. Simplify `app/api/student/register/route.ts`

Update the Zod schema — remove `brokerConnectionId`, `tradingAccountNumber`, `platformAccountNumber`. The schema becomes exactly what the handoff specifies (reproduced for precision):

```typescript
const registrationSchema = z.object({
  portalSlug: z.string().min(1),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().max(320),
  phoneNumber: z.string().trim().min(7).max(32).regex(/^\+?[0-9 ()-]+$/),
  consent: z.literal(true),
  tradingLevel: z.string().nullable().optional(),
  yearsTrading: z.string().nullable().optional(),
  tradingChallenge: z.string().max(500).nullable().optional(),
});
```

Remove the `brokerConnectionId` parse from `formData`. Remove the `validConnection` DB query. Remove the screenshot proof upload block entirely (proof handling is now in the dashboard). Remove the `allowedProofTypes` constant. Remove the `screenshotPath` variable.

On `student_applications` insert, set broker fields to null:
```typescript
trader_broker_account_id: null,
broker_account_identifier: null,
trading_account_number: null,
platform_account_number: null,
```

The initial status for ALL new applications is `'pending'` — regardless of any broker method. Remove the `initialStatus` conditional logic.

Remove the `verification_attempts` insert from the register route entirely. No verification attempt is created at signup — there is nothing to verify yet.

Preserve the rollback pattern: if application insert fails, delete the created auth user. If profile update fails, delete the created auth user. These must remain.

### 6d. Database migration: `202606240029_deferred_broker_verification.sql`

**This migration does exactly what the handoff specifies — with corrections to the storage policy (see Correction 1 in Architect's Pre-Delivery Notes).**

```sql
-- Migration 029: Deferred broker association
-- signup no longer requires broker details at registration

-- 1. Allow student_applications to be created without a broker account
ALTER TABLE public.student_applications
  ALTER COLUMN trader_broker_account_id DROP NOT NULL;

ALTER TABLE public.student_applications
  ALTER COLUMN broker_account_identifier DROP NOT NULL;
```

Before writing these ALTER statements, Engineering must confirm the current constraint state using the query in Section 4, point 2. If either column is already nullable, skip its ALTER statement.

**Storage policies (with corrected enum values — no `needs_more_information`):**

```sql
DROP POLICY IF EXISTS "students upload resubmission verification proofs"
  ON storage.objects;

CREATE POLICY "students upload resubmission verification proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (storage.foldername(name))[2]::uuid = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.student_applications sa
    WHERE sa.trader_id = (storage.foldername(name))[1]::uuid
      AND sa.student_user_id = auth.uid()
      AND sa.status IN (
        'pending'::public.verification_status,
        'manual_review'::public.verification_status
      )
  )
);

DROP POLICY IF EXISTS "students update resubmission verification proofs"
  ON storage.objects;

CREATE POLICY "students update resubmission verification proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (storage.foldername(name))[2]::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (storage.foldername(name))[2]::uuid = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.student_applications sa
    WHERE sa.trader_id = (storage.foldername(name))[1]::uuid
      AND sa.student_user_id = auth.uid()
      AND sa.status IN (
        'pending'::public.verification_status,
        'manual_review'::public.verification_status
      )
  )
);
```

**Before writing the DROP POLICY statements:** confirm the exact policy names from migration 028 using the query in Section 4, point 6. Use the confirmed names, not assumed names.

**`get_student_broker_guide` function replacement:**

```sql
CREATE OR REPLACE FUNCTION public.get_student_broker_guide(p_portal_id uuid)
RETURNS TABLE (
  id uuid,
  broker_id uuid,
  broker_name text,
  broker_logo_path text,
  partner_code text,
  affiliate_link text,
  verification_method public.verification_method,
  verification_instructions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Gate: caller must have an application for this portal
  IF NOT EXISTS (
    SELECT 1 FROM public.student_applications sa
    WHERE sa.student_user_id = auth.uid()
      AND sa.portal_id = p_portal_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tba.id,
    tba.broker_id,
    b.name,
    b.logo_path,
    tba.partner_code,
    tba.affiliate_link,
    tba.verification_method,
    tba.verification_instructions
  FROM public.portals p
  JOIN public.trader_broker_accounts tba
    ON tba.trader_id = p.trader_id
    AND tba.is_active = true
  JOIN public.brokers b
    ON b.id = tba.broker_id
    AND b.is_active = true
  WHERE p.id = p_portal_id
  ORDER BY tba.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_broker_guide(uuid)
  TO authenticated;
```

**Note on `partner_code` exposure:** This is a deliberate reversal of EP-014's decision to hide `partner_code`. The SECURITY DEFINER gate ensures only students with a valid application for the matching portal can access this data. The function still does NOT return `api_config`, `adapter_key`, or any other sensitive configuration. Engineering must add a documentation note in `docs/BROKER_INTEGRATIONS.md` explaining this decision.

**`adapter_key` must NOT be returned.** The proposed function correctly omits `adapter_key` — confirm it is absent from the SELECT list before deploying.

### 6e. New API route: `app/api/student/verify/route.ts`

Authenticated POST. This is the dashboard verification trigger.

**Architecture — MUST use Edge Function for API broker verification:**

Before writing this route, Engineering must read the `verify-broker-account` Edge Function in Supabase to understand: its expected request body, how it resolves broker credentials, what it returns, and whether it supports being invoked with explicit account numbers (vs. reading from an existing application row).

The route's responsibility:
1. Authenticate the caller
2. Validate inputs
3. Check rate limit
4. Load application and broker connections
5. **For `api` verification method: invoke the Edge Function** — do NOT implement broker API calls inline
6. For `manual_review` or `screenshot_upload` methods: transition directly to `manual_review` without invoking the Edge Function
7. Update application status
8. Create `verification_attempts` row
9. Return result

**Route implementation:**

```typescript
// Request body
{
  accountNumber?: string;       // trading account number — optional
  brokerConnectionId?: string;  // specific broker to check; if omitted, try all active
  portalId: string;             // required — identifies the correct application
}
```

**Step 1 — Authentication:**
Use `createClient` (not `createAdminClient`). Call `supabase.auth.getUser()`. Reject with 401 if not authenticated.

Load the student's profile role. Reject with 403 if `role !== 'student'`.

**Step 2 — Input validation:**
Zod schema:
```typescript
z.object({
  portalId: z.string().uuid(),
  accountNumber: z.string().trim().min(3).max(120).optional(),
  brokerConnectionId: z.string().uuid().optional(),
})
```

**Step 3 — Load application:**
Use `createAdminClient` from here forward for DB writes.

```sql
SELECT id, trader_id, portal_id, status, student_user_id
FROM student_applications
WHERE student_user_id = :user_id
  AND portal_id = :portal_id
ORDER BY submitted_at DESC
LIMIT 1
```

Reject with 404 if no application.  
Reject with 400 `{ error: "Application is already verified." }` if status is `'verified'`.  
Reject with 400 `{ error: "Application has been rejected." }` if status is `'rejected'`.

**Step 4 — Rate limit check:**
```sql
SELECT COUNT(*) FROM verification_attempts
WHERE application_id = :application_id
  AND created_at > now() - interval '1 hour'
```
If count ≥ 5, return 429 `{ error: "Too many verification attempts. Please wait before trying again." }`.

**Step 5 — Load broker connections:**
```sql
SELECT tba.id, tba.broker_id, tba.verification_method, tba.partner_code,
       b.name
FROM trader_broker_accounts tba
JOIN brokers b ON b.id = tba.broker_id
WHERE tba.trader_id = :trader_id
  AND tba.is_active = true
  AND b.is_active = true
  [AND tba.id = :brokerConnectionId IF provided]
ORDER BY tba.created_at ASC
```

If `brokerConnectionId` was provided but no matching row found for this trader, return 400 `{ error: "Broker connection not found." }`.

**Step 6 — Verification logic:**

Separate connections into two groups: `api` method and non-api (manual_review / screenshot_upload).

For each `api` connection:
- **Invoke the `verify-broker-account` Edge Function.** Use `supabaseAdmin.functions.invoke('verify-broker-account', { body: { ... } })`. The exact body shape must match what the Edge Function expects — Engineering reads this from the Edge Function source (Section 4, point 1). Pass at minimum: `traderId`, `applicationId`, `brokerConnectionId` (the specific connection), and `accountNumber` (if provided).
- If the Edge Function returns a verified result: stop iterating, proceed to success flow.
- If the Edge Function returns an error or non-match: continue to next connection.

If no `api` connections verify the student (or all connections are non-api):
- Proceed to `manual_review` flow.

**Step 7 — On successful API verification:**

Update application:
```typescript
{
  status: 'verified',
  trader_broker_account_id: matchedConnectionId,
  broker_account_identifier: accountNumber ?? null,
  trading_account_number: accountNumber ?? null,
  // verified_at: new Date().toISOString() — include only if column confirmed to exist
}
```

Insert `verification_attempts`:
```typescript
{
  trader_id: application.trader_id,
  application_id: application.id,
  broker_id: matchedBroker.broker_id,
  request_id: crypto.randomUUID(),
  status: 'verified',
  verification_method: 'api',
  adapter_key: 'dashboard-api',  // identifies this as a dashboard-triggered attempt
  response_summary: {
    triggeredFrom: 'student_dashboard',
    matchedBy: accountNumber ? 'account_number' : 'email',
    accountNumberProvided: Boolean(accountNumber),
  }
}
```

Emit audit log via `write_audit_log` (consistent with existing patterns).

Return `{ status: 'verified' }` with 200.

**Step 8 — On manual_review transition:**

Select the `brokerConnectionId` that was provided (or the first active connection if none was specified).

Update application:
```typescript
{
  status: 'manual_review',
  trader_broker_account_id: selectedConnectionId ?? null,
  broker_account_identifier: accountNumber ?? null,
  trading_account_number: accountNumber ?? null,
}
```

Insert `verification_attempts`:
```typescript
{
  trader_id: application.trader_id,
  application_id: application.id,
  broker_id: selectedBroker.broker_id,
  request_id: crypto.randomUUID(),
  status: 'manual_review',
  verification_method: selectedBroker.verification_method,
  adapter_key: 'dashboard-manual',
  response_summary: {
    triggeredFrom: 'student_dashboard',
    accountNumberProvided: Boolean(accountNumber),
    reason: apiConnectionsExisted ? 'api_verification_failed' : 'no_api_broker',
  }
}
```

Return `{ status: 'manual_review' }` with 200.

### 6f. Update `BrokerGuideCard` (from EP-014)

`BrokerGuideCard` was built in EP-014 to show a single broker. It must now support multiple brokers from the updated `get_student_broker_guide`.

If the portal has only one active broker: render the existing card layout unchanged.

If the portal has multiple active brokers: render a tab selector or accordion — one per broker — showing each broker's name, `partner_code`, `affiliate_link`, `verification_method`, and `verification_instructions`.

### 6g. Add verification submission form to `app/student/page.tsx`

The student dashboard's unverified state currently shows `BrokerGuideCard` and (for `manual_review` + `screenshot_upload` students) `VerificationScreenshotUpload`.

After EP-015, ALL unverified students (including `pending` status) see an active verification form. The form must be integrated into or adjacent to `BrokerGuideCard`.

**Verification form — client component (`VerifyAccountForm`):**

Props:
```typescript
interface VerifyAccountFormProps {
  portalId: string;
  brokers: Array<{
    id: string;
    broker_name: string;
    verification_method: VerificationMethod;
    // other broker guide fields
  }>;
  querySuffix: string;
}
```

Form fields:
- If multiple brokers: dropdown "Which broker is your account with?" — optional if student doesn't know
- Input "Trading account number" — optional, hint: "Don't know it? Leave blank and upload a screenshot below"
- "Verify my account" button — POST to `/api/student/verify`

On response `{ status: 'verified' }`:
- `window.location.href = '/student' + querySuffix` — full page reload so the server component re-fetches verified state

On response `{ status: 'manual_review' }`:
- Show inline success message: "We couldn't verify automatically — your account has been sent for manual review. You'll receive an email when it's approved."
- Do NOT reload the page

On error:
- Show inline error from response body
- Re-enable the submit button

Loading state: disable button and show spinner during the POST.

**`VerificationScreenshotUpload` remains below the form** for all unverified students. After EP-015, both `pending` and `manual_review` students can upload screenshots (storage policy permits both — see migration 029).

When screenshot upload completes, call `/api/student/verify` with no `accountNumber` (and the screenshot path already set via `/api/student/verification-screenshot`) to trigger the manual_review transition.

---

## 7. Database and Migration Requirements

Migration file: `supabase/migrations/202606240029_deferred_broker_verification.sql`

Contents: exactly as specified in Section 6d. No other tables, columns, or enums are modified.

After migration is written, verify it against the corrected version in Section 6d. Confirm `needs_more_information` does NOT appear anywhere in the migration file.

After applying the migration, run:
```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'student_applications'
AND column_name IN ('trader_broker_account_id', 'broker_account_identifier');
```
Both must return `is_nullable = YES`.

---

## 8. RLS and Security Requirements

### 8a. `partner_code` exposure — deliberate security posture change

As noted in Correction 4: `get_student_broker_guide` now returns `partner_code`. This is intentional. The SECURITY DEFINER gate ensures only students with a valid application for the matching portal can call the function. `api_config`, `adapter_key`, and any credential fields must NOT appear in the function's SELECT list. Engineering must confirm these are absent before deploying.

### 8b. `/api/student/verify` — tenant isolation

`brokerConnectionId`, if provided, must belong to the same `trader_id` as the student's application. The query in Step 5 enforces this by filtering `tba.trader_id = :trader_id`. This tenant-isolation check must never be omitted.

### 8c. `/api/student/verify` — no cross-student access

The verify route resolves the application using `student_user_id = auth.uid()`. A student cannot trigger verification for another student's application. This check must be in place before any DB writes.

### 8d. Edge Function invocation — credential safety

The Edge Function is invoked server-side using `supabaseAdmin.functions.invoke()` with the service role key. This key must never appear in the API response or client-side code. The invocation happens inside the Next.js API route handler, not in a client component.

### 8e. Storage policy correction

Migration 029 replaces the storage policies from migration 028. Confirm the DROP statements target the correct policy names from migration 028 before running. Do not drop unrelated policies.

---

## 9. Multi-Tenancy Requirements

- `trader_id` is always resolved from `student_applications.trader_id` — never from a request body field.
- Broker connections queried in the verify route are always filtered by `tba.trader_id = application.trader_id`.
- `get_student_broker_guide(p_portal_id)` resolves `trader_id` from the portal — not from a student-supplied parameter.
- The `VerifyAccountForm` client component receives `portalId` from the server component — never from a URL parameter or localStorage.

---

## 10. Authentication and Authorization

- The `/api/student/verify` route uses `createClient` for the authentication check and `createAdminClient` for DB writes.
- Role check: `profile.role` must be `'student'`. Return 403 for any other role.
- The register route no longer calls the Edge Function or any broker API — it is a pure data creation route.
- The verify route never exposes broker credentials, vault secrets, or adapter configurations in its response.

---

## 11. API and Integration Requirements

### Modified: `POST /api/student/register`
- Accepts: `portalSlug`, `fullName`, `email`, `phoneNumber`, `consent`, `tradingLevel`, `yearsTrading`, `tradingChallenge`
- Does NOT accept: `brokerConnectionId`, `tradingAccountNumber`, `platformAccountNumber`, `screenshotProof`
- Creates: auth user, `student_applications` (broker fields null, status `pending`), `profiles` update
- Does NOT create: `verification_attempts`

### New: `POST /api/student/verify`
- See Section 6e for complete spec
- Key: all broker API calls go through the Edge Function — not inline

### Unchanged: `PATCH /api/student/verification-screenshot`
- Behaviour from EP-014 unchanged. Rate limit check on the verify route is separate from this endpoint.

---

## 12. UI/UX and Accessibility Requirements

### Registration form (3 steps)
- Step indicator shows 3 circles, not 4
- Step 1: Profile — unchanged
- Step 2: Experience — unchanged  
- Step 3: Review — updated consent text (see Section 6a), updated "What happens next" paragraph
- No broker fields appear anywhere in the form
- "Join Academy" submit button on Step 3

### Verification form on dashboard
- Must be visible to all unverified students: `pending`, `processing`, `manual_review`
- Not visible to `verified` or `rejected` students
- Account number field: `type="text"`, `autoComplete="off"`, clearly labelled
- Broker selector (if multiple brokers): accessible `<select>` with "I'm not sure" as first option
- Loading state: disable button, show Loader2 spinner
- Error state: inline error beneath the button (not a toast)
- Success (manual_review): inline message, green/success styling, form collapses or becomes inert

### Empty broker list
If `get_student_broker_guide` returns zero rows for a student's portal, show: "This academy hasn't configured broker verification yet. Contact the academy directly for access."

---

## 13. Storage and Audit Requirements

### Storage
Migration 029 updates the `verification-proofs` storage policies to permit uploads from `pending` students. The path structure and the rest of the EP-014 upload flow are unchanged.

Engineering must confirm the updated policies work by testing an upload from a KaiTrades test student with `pending` status.

### Audit logging
- Verification success (API verified): audit log entry via `write_audit_log`
- Verification failure (manual_review transition): audit log entry
- Both must include `trader_id`, `application_id`, `user_id`, and the outcome

---

## 14. Documentation Requirements

Engineering must update all of the following:

- **`docs/STUDENTS.md`**: Update Registration Process section — 4-step form becomes 3-step (Profile → Experience → Review). Remove broker step description. Add Dashboard Verification subsection describing the new flow: pending students see verification form, submit account number, API check triggers via Edge Function, outcome transitions status.

- **`docs/BROKER_INTEGRATIONS.md`**: 
  - Update API Verification Flow section — steps now start from the student dashboard, not from signup
  - Add explicit note: "`partner_code` is now returned by `get_student_broker_guide` to allow students to register with the correct broker affiliation. This is a deliberate change from EP-014's restriction. The SECURITY DEFINER gate limits access to students with a valid application for the portal."
  - Update Resubmission subsection — storage policies now permit `pending` status uploads

- **`docs/DATABASE.md`**: Update `student_applications` column descriptions to reflect that `trader_broker_account_id` and `broker_account_identifier` are now nullable (deferred until dashboard verification).

- **`CHANGELOG.md`**: Full entry for EP-015.

- **`PRODUCT_STATUS.md`**: Update signup and student verification status.

---

## 15. Testing and Regression Requirements

### TypeScript and build
```bash
npm run typecheck
npm run build
```
Both must pass with zero errors.

### New tests for `/api/student/verify`
- Returns 401 for unauthenticated requests
- Returns 403 for non-student roles (trader, super_admin)
- Returns 404 when no application found for the student + portalId
- Returns 400 when application status is `verified`
- Returns 400 when application status is `rejected`
- Returns 429 when rate limit exceeded (≥5 attempts in the last hour)
- Returns 400 when `brokerConnectionId` belongs to a different trader
- Returns `{ status: 'manual_review' }` when all brokers are non-api
- Returns `{ status: 'manual_review' }` when Edge Function returns no match
- Returns `{ status: 'verified' }` when Edge Function confirms a match

### New tests for simplified `/api/student/register`
- Succeeds without broker fields
- Creates application with `trader_broker_account_id = null`
- Creates application with `broker_account_identifier = null`
- Creates application with `status = 'pending'`
- Does NOT create a `verification_attempts` row
- Does NOT accept `brokerConnectionId` (Zod rejects extra fields gracefully — or verify the field is simply ignored)

### Regression tests — must all still pass
- Existing registration tests (profile creation, duplicate email handling, rollback on application failure)
- Student portal page loads for all statuses (verified, pending, manual_review, rejected)
- EP-014 BrokerGuideCard renders correctly for single-broker scenario
- `VerificationScreenshotUpload` still functions for `manual_review` students

### Role access testing (KaiTrades only)
| Scenario | Expected |
|---|---|
| New KaiTrades student completes 3-step signup | Application created with null broker fields, status `pending` |
| Student on unverified dashboard sees verify form | Form visible with account number field and broker selector |
| Student submits account number, broker API matches | Redirected to verified dashboard |
| Student submits, no API match | Inline "sent for manual review" message |
| Student uploads screenshot from `pending` status | Upload succeeds (policy permits pending) |
| Student calls verify 6 times in 1 hour | 6th attempt returns 429 |
| Trader calls `/api/student/verify` | Returns 403 |

### Browser acceptance (required before EP-015 is accepted)
Capture screenshots (desktop 1280px and mobile 375px) of:
1. 3-step signup form — Step 1 (Profile), Step 2 (Experience), Step 3 (Review) with updated consent text
2. Student on `pending` status — dashboard showing verify form with account number input
3. Student after triggering verification — `manual_review` inline message shown
4. Student after API verification succeeds — full verified dashboard

---

## 16. Acceptance Criteria

All of the following must be true for EP-015 to be accepted:

- [ ] Migration `029` deployed with zero errors
- [ ] `trader_broker_account_id` is nullable in production DB
- [ ] `broker_account_identifier` is nullable in production DB
- [ ] Storage policies updated — `pending` students can upload resubmission proofs
- [ ] `get_student_broker_guide` returns all active brokers (not LIMIT 1)
- [ ] `get_student_broker_guide` returns `partner_code`
- [ ] `get_student_broker_guide` does NOT return `adapter_key` or `api_config`
- [ ] Signup form renders 3 steps — Profile, Experience, Review — no broker fields anywhere
- [ ] Consent text updated to reflect deferred verification (no "selected broker" reference)
- [ ] "What happens next" paragraph updated to mention dashboard verification
- [ ] `POST /api/student/register` succeeds without broker fields
- [ ] New application has `trader_broker_account_id = null`
- [ ] New application has `status = 'pending'`
- [ ] No `verification_attempts` row created at signup
- [ ] `POST /api/student/verify` route exists and is functional
- [ ] Verify route calls Edge Function for `api` broker verification — does NOT call broker APIs inline
- [ ] Verify route enforces `student_user_id = auth.uid()` before any DB write
- [ ] Verify route enforces broker connection belongs to student's trader
- [ ] Rate limiting: 429 after 5 attempts in 60 minutes
- [ ] On API match: application status → `verified`, `verification_attempts` created, audit log emitted
- [ ] On no match: application status → `manual_review`, `verification_attempts` created, audit log emitted
- [ ] `VerifyAccountForm` client component visible for `pending` and `manual_review` students
- [ ] `VerifyAccountForm` hidden for `verified` and `rejected` students
- [ ] Multiple brokers: broker selector visible in form
- [ ] Single broker: no selector shown, form submits for that broker automatically
- [ ] On `verified` response: `window.location.href` reload to student dashboard
- [ ] On `manual_review` response: inline message, no page reload
- [ ] `BrokerGuideCard` renders correctly for both single and multiple brokers
- [ ] `VerificationScreenshotUpload` still works for `manual_review` students
- [ ] `VerificationScreenshotUpload` now also works for `pending` students
- [ ] `npm run typecheck` passes — zero errors
- [ ] `npm run build` passes — zero errors
- [ ] All existing tests pass — zero regressions
- [ ] New verify route tests pass
- [ ] New register route tests pass
- [ ] Browser acceptance screenshots provided (4 scenarios, desktop + mobile = 8 screenshots)
- [ ] `docs/STUDENTS.md` updated
- [ ] `docs/BROKER_INTEGRATIONS.md` updated — `partner_code` exposure documented
- [ ] `docs/DATABASE.md` updated — nullable columns documented
- [ ] `CHANGELOG.md` updated
- [ ] `PRODUCT_STATUS.md` updated

---

## 17. Final Delivery Summary Required from Engineering

1. **Migration confirmation**: Paste result of:
   ```sql
   SELECT column_name, is_nullable FROM information_schema.columns
   WHERE table_name = 'student_applications'
   AND column_name IN ('trader_broker_account_id', 'broker_account_identifier');
   ```
   Both must show `YES`.

2. **Changed files list**: Every file created, modified, or deleted.

3. **Edge Function confirmation**: Confirm the exact Edge Function invocation method used — paste the `supabaseAdmin.functions.invoke(...)` call (without credentials). If the Edge Function required extension to support dashboard-triggered verification, describe what changed.

4. **TypeScript output**: Paste `npm run typecheck` result — zero errors.

5. **Build output**: Paste `npm run build` result — success.

6. **Test output**: Paste full test run — all passing including new tests.

7. **Rate limit confirmation**: Paste the rate-limit check code from the verify route showing it reads `verification_attempts` count before proceeding.

8. **Security confirmation**: Confirm `adapter_key` and `api_config` do NOT appear in `get_student_broker_guide`'s SELECT list. Paste the deployed function body.

9. **`needs_more_information` confirmation**: Confirm the string `needs_more_information` does NOT appear anywhere in migration 029. Paste the storage policy WITH CHECK clause.

10. **Browser acceptance screenshots**: 8 screenshots (4 scenarios × desktop + mobile).

11. **Documentation sign-off**: Confirm all 5 documentation files in Section 14 have been updated.

---

*End of EP-015 — Signup Simplification & Dashboard Verification*
