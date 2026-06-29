# Engineering Prompt EP-017 — Inline Password + OTP Registration

**Issued by:** KaiMentors Enterprise Architect  
**Date:** 2026-06-25  
**Priority:** High  
**Depends on:** EP-015 (Signup Simplification), EP-016 (Dual-Role Support) — both must be deployed  
**No DB migration required** — `auth_challenge_events.purpose` is a free-form TEXT column (application-constrained only)  
**Estimated scope:** Medium — 3 files modified, 1 route updated, form OTP screen added

---

## ARCHITECT'S PRE-DELIVERY NOTES

The handoff is correct in objective and mostly correct in implementation. Six corrections the Architect adds before Engineering begins:

**Correction 1 — `purpose` must be `"student_registration"`, not `"student_otp"` or `"account_setup"`.**  
The handoff proposes using `"student_otp"` as the purpose in `auth_challenge_events`. The existing `app/api/student/resend-otp/route.ts` (already in the codebase from a prior implementation) incorrectly uses `"account_setup"` as the purpose. Both are wrong. Using `"account_setup"` would cause cross-contamination with the mentor account-setup rate limit — if a student triggers the registration OTP, then later tries to resume account setup, the 60-second gate would block them incorrectly. Using a dedicated `"student_registration"` purpose isolates the student registration OTP from all other challenge flows. Engineering must change the `resend-otp` route to use `"student_registration"` and the register route must record events with the same purpose.

**Correction 2 — `canSendAuthEmail` is missing from both the register route OTP send and the existing `resend-otp` route.**  
`app/api/account-setup/start` calls `canSendAuthEmail(admin, userId)` before every OTP send. `app/api/auth/challenges/request` calls it too. The existing `app/api/student/resend-otp/route.ts` does NOT call it — this is a bug in the existing implementation. This EP must fix both: the OTP send in `register/route.ts` and the `resend-otp/route.ts` must both call `canSendAuthEmail(admin, userId)` before invoking `admin.auth.signInWithOtp`. Without this check, OTPs could be sent to non-KaiTrades students when the platform is in canary-only delivery mode, violating the delivery policy.

**Correction 3 — `verifyOtp` type must be `"signup"`, not `"email"`.**  
The handoff proposes `supabase.auth.verifyOtp({ email, token, type: "email" })`. From `docs/AUTHENTICATION.md`: "`signInWithOtp` sends **Confirm signup** when the user is missing or unconfirmed." After `createUser({ email_confirm: false })`, the user is unconfirmed — Supabase will send the "Confirm signup" template. The correct client-side verification type for a Confirm signup OTP is `type: "signup"`. Engineering must test this in KaiTrades before marking complete. If `type: "signup"` causes an error and `type: "email"` works, document why in the delivery summary.

**Correction 4 — Password must NOT be a hidden `<input>` in the DOM.**  
The current registration form passes field values via hidden `<input type="hidden">` elements that are visible in the browser DOM. If password were added as a hidden input, it would be visible in plaintext via browser developer tools, violating basic security hygiene. The password must be added to FormData in the submit handler function directly: `formData.set("password", password)` — the same pattern used for `screenshotProof` in the old form. Do not add a `<input type="hidden" name="password">` to the JSX.

**Correction 5 — This EP changes documented security architecture. `AUTHENTICATION.md` must be updated.**  
`docs/AUTHENTICATION.md` currently states: "Passwords are absent from mentor onboarding and student registration requests. Password creation is exposed only after successful OTP verification." This EP deliberately changes the student registration flow: passwords are NOW present in the registration request, and OTP verification happens immediately after (not before) password creation. This is an intentional security posture change. Engineering must update `AUTHENTICATION.md` to document the new student registration auth model. The change is architecturally sound (it's the standard email+password signup pattern) — it just needs to be documented accurately.

**Correction 6 — The existing `resend-otp/route.ts` must be updated as part of this EP.**  
`app/api/student/resend-otp/route.ts` already exists in the codebase. It was created by a prior implementation but currently has two bugs: (a) it uses `purpose: "account_setup"` instead of `"student_registration"`, (b) it does not call `canSendAuthEmail`. This EP must fix both bugs in the existing file — do not create a new file.

---

## 1. Task Title

Inline Password + OTP Registration — Add Password to Signup Form, Send OTP After Registration, Verify Email Inline

---

## 2. Business Objective

Students currently register on the academy page, then get redirected to `kaimentors.vercel.app/account-setup` — a mentor-focused platform page where they set their password. This page references workspace setup, invitations, and platform copy that has nothing to do with students. It breaks the academy-specific experience and exposes students to internal platform branding.

The new flow keeps students on the academy page from start to finish: register → OTP screen inline on the same page → redirect to student portal. No platform redirect. No account-setup page. Full password set at registration time, OTP used for email verification only.

---

## 3. Current State and Problems

**Read these files before touching anything:**
- `app/api/student/register/route.ts` — current registration API (EP-015 version)
- `app/api/student/resend-otp/route.ts` — existing file, currently has bugs (see Pre-Delivery Notes)
- `components/student-registration-form.tsx` — current 3-step form (EP-015/016 version)
- `components/academy-join-page.tsx` — current props passed to form
- `lib/account-setup.ts` — `hashAccountSetupValue` utility
- `lib/auth-email-policy.ts` — `canSendAuthEmail` function
- `app/api/auth/challenges/request/route.ts` — reference for the correct pattern
- `app/api/account-setup/start/route.ts` — reference for OTP send + rate limit pattern
- `docs/AUTHENTICATION.md`

**Run this grep first:**
```bash
grep -r "account-setup\|/account-setup" components/ app/ --include="*.ts" --include="*.tsx"
```
Find every reference to the account-setup redirect in the student code path. After this EP, no student code should redirect to `/account-setup`.

### Current problem: students land on a mentor-focused platform page

After registration, `student-registration-form.tsx` currently does:
```typescript
setTimeout(() => router.push("/account-setup"), 1500);
```
and writes:
```typescript
window.sessionStorage.setItem("kaimentors.accountSetupEmail", resolvedEmail);
```

`/account-setup` is the mentor workspace setup page. Students are never supposed to be there. It contains mentor-specific copy, workspace setup references, and invitation handling that doesn't apply to students.

### Current problem: `resend-otp/route.ts` has two bugs

1. Uses `purpose: "account_setup"` — wrong purpose, causes rate-limit collision with mentor account-setup
2. Does not call `canSendAuthEmail` — OTPs could be sent in violation of delivery policy

---

## 4. Root Cause Investigation Requirements

Before writing any code, Engineering must:

1. **Confirm `auth_challenge_events.purpose` is a free-form text column:**
   ```sql
   SELECT column_name, data_type, character_maximum_length, 
          is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'auth_challenge_events' AND column_name = 'purpose';
   ```
   Also check for CHECK constraints:
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'auth_challenge_events'::regclass AND contype = 'c';
   ```
   If a CHECK constraint exists that restricts `purpose` values, a migration is needed to add `"student_registration"`. Confirm before proceeding.

2. **Read `lib/auth-email-policy.ts` in full.** Understand `canSendAuthEmail` — what it returns, when it returns false, and what the caller must do when it returns false (log a suppressed event).

3. **Confirm `hashAccountSetupValue` is the correct hashing utility to use** in the resend-otp route for consistency with other challenge flows. (Currently the resend route uses `createHash("sha256").update(email).digest("hex")` directly without trimming/lowercasing — `hashAccountSetupValue` normalizes the email first.)

4. **Test `verifyOtp` type in KaiTrades** before writing the production form. Use a KaiTrades test account: create a user with `email_confirm: false` + password, send OTP via `signInWithOtp`, then test whether `verifyOtp({ type: "signup", ... })` or `verifyOtp({ type: "email", ... })` correctly confirms the session. Do this in the KaiTrades browser environment, not as a unit test.

5. **Confirm Supabase project setting for email confirmation requirement.** If email confirmation is disabled in the Supabase project settings, a user with `email_confirm: false` can sign in before verifying. If enabled, they cannot. Verify which mode KaiMentors uses — the OTP screen is the only path to portal access for new students, and this setting determines whether a student who abandons the OTP can sign in via the login page later.

---

## 5. Existing Architecture to Respect

### OTP delivery policy
Every OTP send in this codebase calls `canSendAuthEmail` before invoking `admin.auth.signInWithOtp`. This is enforced at: `/api/account-setup/start`, `/api/auth/challenges/request`. The student registration OTP must follow the same pattern. No exceptions.

### `auth_challenge_events` audit trail
Every OTP send attempt — successful, suppressed, rate-limited, or failed — creates a row in `auth_challenge_events`. The student registration OTP must follow this pattern exactly, using:
- `purpose: "student_registration"` (new distinct purpose, separate from `"account_setup"`)
- `event_type`: one of `"requested"`, `"resend_requested"`, `"suppressed"`, `"provider_error"`, `"rate_limited"`
- `email_hash`: SHA-256 of trimmed, lowercased email (use `hashAccountSetupValue`)
- `user_id`: the newly created user's ID (available after `createUser`)

### OTP-only email template
`docs/AUTHENTICATION.md` states all email challenges use manually entered OTP. The "Confirm signup" template must render `{{ .Token }}` only — no link, no `ConfirmationURL`. This requirement is unchanged and applies to the student registration OTP.

### Password never in DOM
Platform security standard: sensitive values (passwords, tokens) must not appear in HTML hidden inputs. Add password to FormData programmatically in the submit handler.

### Rollback integrity
If any step after `createUser` fails, the created auth user must be deleted. This rule remains in force. The OTP send failure is explicitly non-fatal (application created, OTP send failed) — no rollback for OTP failure, but the application row is preserved and the student can use resend.

---

## 6. Implementation Requirements

### 6a. Update `app/api/student/register/route.ts`

**Add `password` to the Zod schema:**
```typescript
password: z.string().min(10).max(128),
```

**Read the password from FormData:**
```typescript
password: formData.get("password")?.toString() ?? "",
```

**Change `createUser` to include the password:**
```typescript
admin.auth.admin.createUser({
  email: input.email,
  password: input.password,
  email_confirm: false,
  user_metadata: { full_name: input.fullName, role: "student" },
})
```

**After the `student_applications` insert succeeds and the student IS a new user (not `isDuplicate`), send OTP:**

```typescript
// Attempt OTP send for new users (non-fatal if it fails)
const deliveryAllowed = await canSendAuthEmail(admin, created.user.id);
if (deliveryAllowed) {
  const { error: otpError } = await admin.auth.signInWithOtp({
    email: input.email,
    options: { shouldCreateUser: false },
  });
  await admin.from("auth_challenge_events").insert({
    user_id: created.user.id,
    purpose: "student_registration",
    event_type: otpError ? "provider_error" : "requested",
    email_hash: hashAccountSetupValue(input.email),
    metadata: otpError
      ? { provider: "supabase_auth", error_code: "delivery_failed" }
      : {},
  });
} else {
  // Delivery not allowed — log suppressed event
  await admin.from("auth_challenge_events").insert({
    user_id: created.user.id,
    purpose: "student_registration",
    event_type: "suppressed",
    email_hash: hashAccountSetupValue(input.email),
    metadata: { reason: "auth_email_canary_gate" },
  });
}
```

Import `hashAccountSetupValue` from `@/lib/account-setup` and `canSendAuthEmail` from `@/lib/auth-email-policy`.

**OTP send is non-fatal.** Do not roll back if OTP send fails. The application is already created.

**Existing user path (from EP-016):** After inserting the application for an existing user, do NOT send an OTP. Existing users already have a confirmed email and a password. Return `{ status: "accepted", email, existingUser: true }` immediately.

**`sessionStorage` write:** Remove `window.sessionStorage.setItem(...)` from any remaining references in the register route response. The student no longer goes to `/account-setup`.

### 6b. Update `app/api/student/resend-otp/route.ts` (existing file — fix bugs)

This file exists but has two bugs. Fix both in a single change:

1. **Change `purpose` to `"student_registration"`** throughout the file.
2. **Add `canSendAuthEmail` check** before calling `admin.auth.signInWithOtp`.
3. **Use `hashAccountSetupValue`** instead of the inline hash — import it from `@/lib/account-setup` for consistency.
4. **Add `user_id` to the audit event** — look up the user by email using `admin.auth.admin.getUserByEmail(email)` to get the `userId` for the audit row.

The corrected route:
```typescript
// After rate-limit check passes:
const deliveryAllowed = await canSendAuthEmail(admin, userId ?? null);
if (!deliveryAllowed) {
  // Suppressed — silently return 202, log audit
  await admin.from("auth_challenge_events").insert({
    user_id: userId,
    purpose: "student_registration",
    event_type: "suppressed",
    email_hash: emailHash,
    metadata: { reason: "auth_email_canary_gate" },
  });
  return NextResponse.json({ status: "accepted" }, { status: 202 });
}

const { error: sendError } = await admin.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false },
});

await admin.from("auth_challenge_events").insert({
  user_id: userId,
  purpose: "student_registration",
  event_type: sendError ? "provider_error" : "resend_requested",
  email_hash: emailHash,
  metadata: sendError ? { provider: "supabase_auth", error_code: "delivery_failed" } : {},
});

return NextResponse.json({ status: "accepted" }, { status: 202 });
```

The route continues to always return 202 regardless of outcome — do not expose rate limiting or delivery state to the caller. This is intentionally different from the account-setup start route (which returns 429). The silent-202 approach is more secure for a public-facing endpoint.

### 6c. Update `components/student-registration-form.tsx`

**Add two new state variables** (after the existing phone number state):
```typescript
const [password, setPassword] = useState("");
const [passwordConfirmation, setPasswordConfirmation] = useState("");
```

**Add `loginPath`, `academyName`, `studentDestination` to `RegistrationFormProps`:**
These were already added in EP-016 (partially). Confirm they exist. `studentDestination` was previously `studentPortalPath` — verify the current prop name and rename only if needed.

**Update `step1Valid`:**
```typescript
const step1Valid =
  fullName.trim().length >= 2 &&
  email.includes("@") &&
  phoneNumber.trim().length >= 7 &&
  password.length >= 10 &&
  password === passwordConfirmation;
```

**Add password fields to Step 1 (`step === 0`) — below the phone number field:**
```tsx
<div className={styles.field}>
  <label htmlFor="srf_password">Password</label>
  <input
    autoComplete="new-password"
    id="srf_password"
    minLength={10}
    onChange={(e) => setPassword(e.target.value)}
    required
    type="password"
    value={password}
  />
  <small>Minimum 10 characters.</small>
</div>
<div className={styles.field}>
  <label htmlFor="srf_passwordConfirm">Confirm password</label>
  <input
    autoComplete="new-password"
    id="srf_passwordConfirm"
    minLength={10}
    onChange={(e) => setPasswordConfirmation(e.target.value)}
    required
    type="password"
    value={passwordConfirmation}
  />
  {passwordConfirmation.length > 0 && password !== passwordConfirmation && (
    <small className={styles.error}>Passwords don't match.</small>
  )}
</div>
```

**Add password to FormData in submit handler — NOT as a hidden input:**
```typescript
async function submit(formData: FormData) {
  setLoading(true);
  setSubmitError("");
  formData.set("password", password);  // added here — not in DOM
  formData.set("portalSlug", portalSlug);
  // ... rest of submit
}
```

Do not add `<input type="hidden" name="password" />` anywhere in the JSX.

**Add OTP screen state:**
```typescript
const [otpScreen, setOtpScreen] = useState(false);
const [otpCode, setOtpCode] = useState("");
const [otpError, setOtpError] = useState("");
const [otpLoading, setOtpLoading] = useState(false);
const [submittedEmail, setSubmittedEmail] = useState("");
```

**In the submit function, on success:**
```typescript
const resolvedEmail = String(payload.email ?? formData.get("email")).trim().toLowerCase();
setSubmittedEmail(resolvedEmail);

if (payload.existingUser === true) {
  setDone(true);  // show existing-user success screen
} else {
  setOtpScreen(true);  // show OTP screen
}
```

Remove the `sessionStorage` write. Remove the `useRouter` import and `router.push` calls. Remove the `setTimeout` redirect.

**Add OTP verification function:**
```typescript
async function verifyOtp() {
  setOtpLoading(true);
  setOtpError("");
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: submittedEmail,
      token: otpCode.trim(),
      type: "signup",  // see Correction 3 — test this in KaiTrades
    });
    if (error) throw new Error("The code is incorrect or has expired. Try again or request a new code.");
    window.location.href = studentDestination;
  } catch (err) {
    setOtpError(err instanceof Error ? err.message : "Verification failed.");
  } finally {
    setOtpLoading(false);
  }
}
```

Import `createClient` from `@/lib/supabase/browser` (already imported in the form for other uses — confirm it's imported).

**Add resend function:**
```typescript
async function resendOtp() {
  // No client-side cooldown — server enforces rate limit silently
  await fetch("/api/student/resend-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: submittedEmail }),
  });
  // Always show a confirmation message regardless of server response
  // (server always returns 202 — don't expose rate limiting state)
}
```

**Render the OTP screen (replaces all step content when `otpScreen === true`):**

```tsx
if (otpScreen) {
  return (
    <div className={styles.otpScreen}>
      <CheckCircle2 size={42} style={{ color: primaryColor }} />
      <h2>Check your inbox</h2>
      <p>We sent a 6-digit code to <strong>{submittedEmail}</strong>.</p>
      <div className={styles.field}>
        <label htmlFor="srf_otp">Verification code</label>
        <input
          autoComplete="one-time-code"
          id="srf_otp"
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
          pattern="\d{6}"
          placeholder="000000"
          value={otpCode}
        />
      </div>
      {otpError && <p className={styles.error}>{otpError}</p>}
      <button
        disabled={otpCode.length !== 6 || otpLoading}
        onClick={verifyOtp}
        style={otpCode.length === 6 ? { background: primaryColor } : undefined}
        type="button"
      >
        {otpLoading ? <Loader2 className={styles.spin} size={18} /> : null}
        Verify and continue
      </button>
      <button
        className={styles.resendBtn}
        onClick={resendOtp}
        type="button"
      >
        Resend code
      </button>
    </div>
  );
}
```

**Render the existing-user `done` screen (when `existingUser: true`):**

```tsx
if (done) {
  return (
    <div className={styles.success}>
      <CheckCircle2 size={42} style={{ color: primaryColor }} />
      <h2>Application submitted!</h2>
      <p>
        You already have a KaiMentors account. Use your existing password to{" "}
        <a href={loginPath}>sign in to {academyName ?? "the academy"}</a>.
      </p>
    </div>
  );
}
```

This replaces the current `done` success screen which redirected to account-setup.

**Remove:**
- `useRouter` import and usage
- `sessionStorage` write
- `setTimeout` redirect
- Any remaining reference to `/account-setup`

### 6d. Update `components/academy-join-page.tsx`

Confirm `loginPath`, `academyName`, and `studentDestination` (or `studentPortalPath`) are passed correctly. The `loginHref` and `studentPortalPath` variables are already computed in this component (EP-016 added `loginHref`). Add `academyName={data.portal.portal_name}` if not already present.

Confirm no reference to `/account-setup` remains in this component.

---

## 7. Database and Migration Requirements

**No migration required** — IF `auth_challenge_events.purpose` is a free-form TEXT column (verify using the queries in Section 4, point 1).

If Engineering discovers a CHECK constraint restricting `purpose` values, a migration is required to extend it. Do not proceed without this check.

---

## 8. RLS and Security Requirements

### 8a. Password never logged or stored in application layer
The `password` field from FormData must never be logged, included in error messages, or written to any database column other than `auth.users` (handled by Supabase Auth internally). The register route's error logging must not include `input.password` in any metadata.

### 8b. `canSendAuthEmail` is mandatory
Every `admin.auth.signInWithOtp()` call in student registration flows must be preceded by a `canSendAuthEmail` check. This applies to both the register route and the resend-otp route. This is a non-negotiable policy requirement.

### 8c. `verifyOtp` is called client-side with browser session
`supabase.auth.verifyOtp()` uses the browser Supabase client (anon key). This is the standard Supabase pattern for email verification. The service role must not be used for `verifyOtp`.

### 8d. OTP code never stored
OTP codes entered by the student must never be logged, stored in state beyond the immediate verification call, or sent to any server endpoint other than Supabase Auth directly. The resend-otp endpoint does not accept or process OTP codes — it only triggers a new OTP send.

### 8e. Email enumeration prevention
The `resend-otp` route always returns 202. The register route returns 202 for both new and existing users (with `existingUser: true` added for the client to differentiate UI state only). These responses must not leak whether an email is registered to an unauthenticated attacker. The `existingUser` flag is only relevant after the student has submitted their own email — it does not confirm email existence to a third party.

---

## 9. Multi-Tenancy Requirements

The OTP flow has no tenant context. `auth_challenge_events` stores email hashes (not tenant IDs) — this is correct and unchanged. The OTP verification (`verifyOtp`) is a pure Supabase Auth operation with no tenant scope. Multi-tenancy is not affected by this EP.

---

## 10. Authentication and Authorization

### Security posture change from documented model
`docs/AUTHENTICATION.md` currently states: "Passwords are absent from mentor onboarding and student registration requests." This EP changes the student path — passwords ARE now present in student registration. This is a deliberate change. The new model: student provides password at registration → OTP sent → student verifies OTP → email confirmed → student accesses portal with password. AUTHENTICATION.md must be updated to document this new student path clearly.

### `email_confirm: false` + password
After `createUser({ password, email_confirm: false })`:
- The user account exists with a password
- The email is unconfirmed
- Whether the user can sign in before email confirmation depends on the Supabase project setting ("Enable email confirmations")
- The OTP step is the designed path to email confirmation
- Engineering must confirm the email confirmation enforcement setting and document it in the delivery summary

### Supabase template
The OTP sent is triggered by `signInWithOtp` for an unconfirmed user — this sends the "Confirm signup" template. AUTHENTICATION.md confirms this template must render `{{ .Token }}` only. No link. This requirement is unchanged.

---

## 11. API and Integration Requirements

### Modified: `POST /api/student/register`
- Accepts additional field: `password` (string, min 10, max 128)
- Creates auth user WITH password
- Sends OTP after successful application insert (for new users only)
- No `sessionStorage` write
- No redirect to `/account-setup`
- Existing user path: no OTP sent, returns `{ status: "accepted", email, existingUser: true }`

### Updated: `POST /api/student/resend-otp`
- Bug fix: change `purpose` from `"account_setup"` to `"student_registration"`
- Bug fix: add `canSendAuthEmail` gate
- Bug fix: use `hashAccountSetupValue` for consistent email hashing
- Bug fix: add `user_id` to audit events
- Behavior otherwise unchanged: always returns 202, silently suppresses rate-limited requests

---

## 12. UI/UX and Accessibility Requirements

### Password fields
- Both password inputs use `type="password"` (browser hides value)
- `autoComplete="new-password"` on both (prevents browser autofill from pasting existing passwords)
- `minLength={10}` attribute for HTML5 validation
- Small helper text: "Minimum 10 characters."
- Inline mismatch error only when second field has content and passwords don't match (not on every keystroke before the user has typed)

### OTP screen
- Numeric-only input: `inputMode="numeric"`, `pattern="\d{6}"`, strip non-digits on `onChange`
- `autoComplete="one-time-code"` — enables browser/OS autofill for SMS/email codes
- Max length: 6
- "Verify and continue" button disabled until exactly 6 digits entered
- "Resend code" button — always visible, no client-side cooldown display (server is silent about rate limiting)
- Inline error message for bad/expired code — student stays on OTP screen

### Existing user screen
- Links to the academy login page via `loginPath` prop
- Mentions the academy name so the student knows where to go
- No spinner, no loading state — this is a static success screen

### Responsive
- Password fields and OTP screen must work correctly at 375px (mobile) and 1280px (desktop)
- OTP input: large font, centered, easy to tap on mobile

---

## 13. Storage and Audit Requirements

**Audit events:** All OTP sends and suppressions create `auth_challenge_events` rows with `purpose: "student_registration"`. This is a new purpose value. Confirm it is acceptable before the first insert (Section 4, point 1).

**No storage changes.** No files are uploaded in this EP.

**`sessionStorage` removal:** The `window.sessionStorage.setItem("kaimentors.accountSetupEmail", ...)` write in the registration form must be removed. Confirm no other code reads this key in the student path (account-setup reads it for the mentor path — that is unchanged and must still work).

---

## 14. Documentation Requirements

- **`docs/AUTHENTICATION.md`**: Update the Student User Creation section and the Unified Resume Account Setup section. The student registration no longer routes to `/account-setup`. Add a new subsection "Inline Student Registration OTP" describing the new flow: password set at registration, OTP sent post-registration, `verifyOtp({ type: "signup" })` completes email confirmation, student redirected to portal. Update the sentence "Passwords are absent from mentor onboarding and student registration requests" — it now applies to mentor onboarding only.
- **`docs/STUDENTS.md`**: Update Registration Process — password fields are now in Step 1. After submit, student sees inline OTP screen. Verify + redirect to portal. No `/account-setup` redirect.
- **`CHANGELOG.md`**: EP-017 entry.
- **`PRODUCT_STATUS.md`**: Update as appropriate.

---

## 15. Testing and Regression Requirements

### TypeScript and build
```bash
npm run typecheck
npm run build
```
Zero errors required.

### New tests for register route
- Accepts `password` field (min 10 chars), creates user with password
- Rejects `password` shorter than 10 chars (Zod validation)
- After successful application insert: OTP send called when `canSendAuthEmail` returns true
- After successful application insert: OTP NOT sent, suppressed event logged when `canSendAuthEmail` returns false
- Existing user path: no OTP sent, returns `existingUser: true`

### New tests for resend-otp route
- Returns 202 always (regardless of outcome)
- Rate-limited requests: no OTP sent, suppressed silently (still 202)
- Uses `"student_registration"` purpose in DB queries and inserts
- Calls `canSendAuthEmail` before `signInWithOtp`

### OTP screen tests (browser — KaiTrades only)
Engineering must capture the following in KaiTrades before delivery:
1. Fresh student completes 3-step form → OTP screen appears inline, no redirect
2. Correct 6-digit code entered → redirect to student portal (confirm email is confirmed in Supabase Auth after redirect)
3. Incorrect code entered → inline error, student stays on OTP screen
4. "Resend code" clicked → new code sent (verify in KaiTrades email); second click within 60s → silently accepted (no duplicate email)
5. Existing-user path → "Application submitted! Use your existing password to sign in" screen appears, link to academy login

### Regression tests
- Mentor navigating to `/account-setup` directly → unchanged behavior
- `sessionStorage.getItem("kaimentors.accountSetupEmail")` still works for mentors who reached account-setup via the mentor path (the mentor form still writes it — the student form only removes the student's write)
- EP-016 dual-role login: TC mentor logging into TC academy → still routed to mentor dashboard
- KaiTrades new student signup with previous 3-step form (EP-015) → now requires password fields too — verify step 1 validation works

### Build validation
All tests passing + typecheck + build = minimum for delivery.

---

## 16. Acceptance Criteria

- [ ] `auth_challenge_events.purpose` constraint confirmed — no migration needed (or migration written if constraint found)
- [ ] `password` field added to register route Zod schema (min 10, max 128)
- [ ] `createUser` creates auth user with password
- [ ] Password added to FormData in submit handler — NOT as a hidden DOM input
- [ ] OTP sent after application insert for new users, gated by `canSendAuthEmail`
- [ ] Suppressed event logged when `canSendAuthEmail` returns false
- [ ] Existing user path: no OTP sent
- [ ] `resend-otp` route updated: `purpose` = `"student_registration"` (not `"account_setup"`)
- [ ] `resend-otp` route calls `canSendAuthEmail` before `signInWithOtp`
- [ ] `resend-otp` route uses `hashAccountSetupValue` for email hashing
- [ ] Registration form: Step 1 includes password + confirm password fields
- [ ] `step1Valid` enforces `password.length >= 10 && password === passwordConfirmation`
- [ ] Password mismatch shows inline error only when confirm field has content
- [ ] OTP screen renders inline after successful registration submit
- [ ] OTP screen has `autoComplete="one-time-code"` and numeric-only input
- [ ] Correct OTP → email confirmed → redirect to student portal (confirm with browser test)
- [ ] Incorrect OTP → inline error, stays on OTP screen
- [ ] "Resend code" sends new OTP; second resend within 60s silently suppressed (server-side)
- [ ] `verifyOtp` type tested in KaiTrades — `"signup"` or `"email"` documented in delivery summary
- [ ] Existing-user screen: "Use your existing password to sign in" with link to academy login
- [ ] No reference to `/account-setup` remains in any student registration code path
- [ ] `sessionStorage.setItem("kaimentors.accountSetupEmail", ...)` removed from student form
- [ ] Mentor `/account-setup` flow completely unaffected
- [ ] `npm run typecheck` passes — zero errors
- [ ] `npm run build` passes — zero errors
- [ ] All existing tests pass — zero regressions
- [ ] New register + resend-otp tests pass
- [ ] 5 browser acceptance scenarios tested in KaiTrades (listed in Section 15)
- [ ] `docs/AUTHENTICATION.md` updated — student path documented, password presence documented
- [ ] `docs/STUDENTS.md` updated
- [ ] `CHANGELOG.md` updated

---

## 17. Final Delivery Summary Required from Engineering

1. **`purpose` constraint confirmation**: Paste the results of both queries from Section 4, point 1. Confirm whether a migration was needed.

2. **`verifyOtp` type used**: State whether `type: "signup"` or `type: "email"` was used and why. Paste the `verifyOtp` call.

3. **Email confirmation setting**: State whether Supabase project has "Enable email confirmations" turned on. What happens if a student abandons the OTP step and tries to sign in via the login page?

4. **`canSendAuthEmail` confirmation**: Confirm both the register route OTP send and the resend-otp route now call `canSendAuthEmail`. Paste both call sites.

5. **Password DOM confirmation**: Confirm the password value is NOT in a `<input type="hidden">` DOM element. Paste the FormData.set call from the submit handler.

6. **`account_setup_email` sessionStorage**: Confirm the student form no longer writes to `sessionStorage`. Confirm mentor account-setup flow still reads from it correctly.

7. **Changed files list**: Every file created, modified, or deleted.

8. **TypeScript output**: `npm run typecheck` — zero errors.

9. **Build output**: `npm run build` — success.

10. **Test output**: All tests passing.

11. **Browser acceptance**: Screenshots or confirmation of all 5 OTP scenarios from Section 15.

12. **Documentation sign-off**: All 4 doc files updated.

---

*End of EP-017 — Inline Password + OTP Registration*
