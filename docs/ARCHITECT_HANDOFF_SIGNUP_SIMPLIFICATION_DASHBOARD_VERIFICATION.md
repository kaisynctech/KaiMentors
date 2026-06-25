# Architect Handoff — Signup Simplification & Dashboard Verification
**Status:** Ready for Architect Review  
**Date:** 2026-06-24  
**Product Owner:** KaiMentors Product Owner  
**Depends on:** ARCHITECT_HANDOFF_STUDENT_PORTAL_REDESIGN.md (student dashboard layout must land first or in the same release)

---

## Objective

Remove the broker step from the student signup form entirely. Students register with only their name, experience, and consent — no broker details at signup. Verification moves to the unverified dashboard, where the system attempts to match the student against all of the mentor's active broker connections using their email and/or an account number they provide. If the broker API cannot verify them, they fall back to screenshot upload.

This eliminates the blocker bug (unregistered students cannot proceed through Step 3) and simplifies the signup to its minimum necessary friction.

---

## Current State

- Signup form has 4 steps: Profile → Experience → Broker → Review
- Step 3 collects: broker selection, "do you have an account?", trading account number, MT4/MT5 number, optional screenshot
- `student_applications.trader_broker_account_id` is NOT NULL — requires a broker to be chosen at signup
- `student_applications.broker_account_identifier` is NOT NULL — requires an account number at signup
- `verification_attempts` row is created at signup time
- `get_student_broker_guide()` has `LIMIT 1` and does not expose `partner_code`
- Resubmission storage policies (migration 028) only permit upload when status is `manual_review` or `needs_more_information` — blocks `pending` students

---

## Scope of Changes

### 1. Student registration form — remove broker step

**`components/student-registration-form.tsx`**

- Change `STEPS` from `["Profile", "Experience", "Broker", "Review"]` to `["Profile", "Experience", "Review"]` (3 steps, indices 0–2)
- Remove all broker-related state: `selectedBrokerId`, `hasAccount`, `tradingAccountNumber`, `platformAccountNumber`, `screenshotFile`, `selectedBroker`
- Remove the `brokers` prop from `RegistrationFormProps` — this component no longer needs broker data
- Remove the Step 3 (`step === 2`) JSX block entirely
- Remove the `brokerConnectionId`, `tradingAccountNumber`, `platformAccountNumber` hidden inputs
- Update `canNext`: step 0 → `step1Valid`, step 1 → `step2Valid` only (no step 2 gate before Review)
- Step indicator renders 3 circles instead of 4
- Remove `RegistrationBroker` interface and all broker-related imports (`ExternalLink`)

**`components/academy-join-page.tsx`**

- Remove the `brokers={data.brokers}` prop from `<StudentRegistrationForm />`

**`lib/academy-entry.ts` (or wherever `AcademyEntryContext` is defined)**

- The `brokers` field on `AcademyEntryContext` can be retained for other uses (e.g., the unverified dashboard reads broker data separately) — do not remove it from the context type, only remove it from `StudentRegistrationForm`'s props.

---

### 2. Signup API — remove broker fields

**`app/api/student/register/route.ts`**

Remove from Zod schema:
- `brokerConnectionId`
- `tradingAccountNumber`
- `platformAccountNumber`

The schema becomes:
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

On `student_applications` insert, set broker-related fields to null:
```typescript
trader_broker_account_id: null,
broker_account_identifier: null,
trading_account_number: null,
platform_account_number: null,
```

**Remove the `verification_attempts` insert from the signup route entirely.** No verification attempt is created at signup — there is nothing to verify yet. The verification attempt is created when the student submits their details from the dashboard.

Remove the screenshot upload logic from the signup route. The `screenshotProof` field is no longer submitted at signup.

The initial status for all new applications is `'pending'`.

---

### 3. New API endpoint — dashboard verification

**New file: `app/api/student/verify/route.ts`**

Authenticated POST endpoint. Called from the student's unverified dashboard when they submit their broker details.

**Request body (JSON):**
```typescript
{
  accountNumber?: string;       // optional — trading account number
  brokerConnectionId?: string;  // optional — specific broker to check; if omitted, try all
}
```

**Behaviour:**

1. Authenticate the caller — must be a student (`role = 'student'`). Reject with 401 if not authenticated, 403 if wrong role.

2. Load the student's application:
```sql
SELECT id, trader_id, portal_id, status, student_user_id
FROM student_applications
WHERE student_user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 1
```
Reject with 404 if no application found. Reject with 400 if status is already `'verified'` or `'rejected'`.

3. Load the student's email from `auth.users` or `profiles`.

4. Load active broker connections for this trader:
```sql
SELECT tba.id, tba.broker_id, tba.verification_method, tba.partner_code,
       b.adapter_key, b.name
FROM trader_broker_accounts tba
JOIN brokers b ON b.id = tba.broker_id
WHERE tba.trader_id = :trader_id
  AND tba.is_active = true
  AND b.is_active = true
```
If `brokerConnectionId` was provided, filter to only that connection (but still verify it belongs to this trader — reject with 400 if not found).

5. For each broker connection:
   - If `verification_method = 'api'`: call the broker adapter with:
     - `email` (always available)
     - `accountNumber` (if provided)
     - `partner_code` (from connection)
     - `adapter_key` (from broker)
   - If any adapter call returns a verified match: **stop iterating**, proceed to verification success.
   - If `verification_method` is `manual_review` or `screenshot_upload`: skip API call, this broker goes to manual.

6. **On successful API verification:**
   - Update `student_applications`:
     ```sql
     UPDATE student_applications SET
       status = 'verified',
       trader_broker_account_id = :matched_connection_id,
       broker_account_identifier = :accountNumber,  -- null if not provided
       trading_account_number = :accountNumber,
       verified_at = now()
     WHERE id = :application_id
     ```
   - Insert `verification_attempts`:
     ```typescript
     {
       trader_id, application_id, broker_id,
       request_id: crypto.randomUUID(),
       status: 'verified',
       verification_method: 'api',
       adapter_key: broker.adapter_key,
       response_summary: {
         matchedBy: accountNumber ? 'account_number' : 'email',
         emailProvided: true,
         accountNumberProvided: Boolean(accountNumber),
       }
     }
     ```
   - Return `{ status: 'verified' }` with 200.

7. **On no API match (all API brokers checked, none matched):**
   - Update `student_applications`:
     ```sql
     UPDATE student_applications SET
       status = 'manual_review',
       trader_broker_account_id = :brokerConnectionId,  -- null if not specified
       broker_account_identifier = :accountNumber,
       trading_account_number = :accountNumber
     WHERE id = :application_id
     ```
   - Insert `verification_attempts` with `status = 'manual_review'`.
   - Return `{ status: 'manual_review' }` with 200.

8. **On all brokers being manual only (no API brokers at all):**
   - Same as "no API match" — application moves to `manual_review`.

**Security:**
- Uses the admin client for all DB writes (application status update requires bypassing RLS).
- The student's `auth.uid()` must match `student_applications.student_user_id` — verified before any write.
- `brokerConnectionId`, if provided, must belong to the same `trader_id` as the application.
- Never expose vault secrets or adapter credentials in API responses.

---

### 4. Database migration — migration 029

```sql
-- Migration 029: Deferred broker association — signup no longer requires broker details

-- 1. Allow student_applications to be created without a broker account
ALTER TABLE public.student_applications
  ALTER COLUMN trader_broker_account_id DROP NOT NULL;

ALTER TABLE public.student_applications
  ALTER COLUMN broker_account_identifier DROP NOT NULL;

-- 2. Update resubmission storage upload policy to allow pending students
-- (was: manual_review and needs_more_information only — blocks students on dashboard
--  verification who haven't yet submitted any broker details)
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
        'manual_review'::public.verification_status,
        'needs_more_information'::public.verification_status
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
        'manual_review'::public.verification_status,
        'needs_more_information'::public.verification_status
      )
  )
);

-- 3. Update get_student_broker_guide to return ALL active brokers (not just one)
--    and expose partner_code (students need it to open their broker account)
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

---

### 5. Student dashboard — verification form

The unverified dashboard (from `ARCHITECT_HANDOFF_STUDENT_PORTAL_REDESIGN.md`) already specifies the broker guide card and screenshot upload. This handoff adds the active verification submission:

**Broker guide card update:** When the mentor has more than one active broker, show each as a separate card (or tabs). The student selects which broker they have an account with.

**"Verify now" form (replaces or extends the screenshot upload card):**
- If mentor has multiple brokers: broker selector dropdown (populated from `get_student_broker_guide`)
- Account number input — label "Trading account number", optional, hint "Don't know it yet? Leave blank and upload a screenshot below"
- "Verify my account" button
- On click: POST to `/api/student/verify` with `{ accountNumber, brokerConnectionId }`
- On response `{ status: 'verified' }`: redirect to verified dashboard (full page reload via `window.location.href`)
- On response `{ status: 'manual_review' }`: show inline message "We couldn't verify automatically — your account has been sent for manual review. You'll receive an email when it's approved."
- On error: show inline error message

**Screenshot upload:** remains below the form. Uploads to `{trader_id}/{student_user_id}/resubmission/{filename}` path (existing storage policies in migration 028, updated in migration 029 to include `pending` status).

After screenshot upload, call `/api/student/verify` with no account number to trigger a manual review transition.

---

## What Is NOT Changing

- The `StudentRegistrationForm` steps Profile and Experience — unchanged
- The `/account-setup` email verification flow — unchanged
- The mentor's student review workflow — unchanged
- Existing `review_student_application` RPC — unchanged
- The `verification-proofs` storage bucket — unchanged
- Any existing verified student functionality

---

## Acceptance Criteria

1. A new KaiTrades test student completes signup in 3 steps (Profile → Experience → Review) with no broker fields anywhere.
2. The student's `student_applications` row is created with `trader_broker_account_id = null`, `broker_account_identifier = null`, `status = 'pending'`.
3. No `verification_attempts` row is created at signup.
4. The student lands on the unverified dashboard and sees the broker guide card(s) with partner code, affiliate link, and verification steps.
5. The student enters their trading account number and clicks "Verify my account" — the API checks the broker(s) and returns `verified` or `manual_review`.
6. On `verified`: application status updates to `verified`, `trader_broker_account_id` and `trading_account_number` are set, student sees the full verified dashboard.
7. On `manual_review`: application status updates to `manual_review`, a `verification_attempts` row is created, inline message shown.
8. If the mentor has 2 active brokers, the student sees both in the broker selector and can choose which to verify against.
9. A student who leaves the account number blank and uploads a screenshot: upload succeeds from `pending` status, `/api/student/verify` call transitions application to `manual_review`.
10. A student POSTing directly to `/api/student/verify` for another student's application receives a 403.
11. `npm run typecheck` and `npm run build` pass with no new errors.
12. Existing KaiTrades acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:
- Migration 029 applied
- Signup form renders 3 steps with no broker fields
- `/api/student/register` accepts and succeeds without broker fields
- `/api/student/verify` created and functioning for both verified and manual_review outcomes
- `get_student_broker_guide` returns all brokers with partner_code
- Storage policies updated — pending students can upload resubmission proofs
- Acceptance criteria 1–12 verified against KaiTrades test environment
- Commit hash and files changed
