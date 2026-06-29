# EP-018 Engineering Prompt — Existing-User OTP Fix

**Status:** Ready for Engineering  
**Date:** 2026-06-25  
**Depends on:** EP-017 (Inline Password + OTP Registration) — deployed  
**No database migration required.**

---

## Objective

Fix two bugs in the student registration flow introduced in EP-017:

1. **Existing-user path sends no OTP.** A mentor who registers at a student portal using their mentor email sees a "use your existing password" screen. The password they just typed is not set on their existing account, so they cannot sign in. The fix: send an OTP for existing users, show the OTP screen for all registrations.

2. **`verifyOtp` type must be conditional.** The correct type depends on whether the user account is confirmed or not. New students are unconfirmed — their OTP was sent via the "Confirm signup" template and the token hash type is `signup`. Existing confirmed users (mentors, students from other academies) receive the "Magic Link" template with hash type `email`. Using `type: "email"` for an unconfirmed user will return a hash mismatch and fail verification. Using `type: "signup"` for a confirmed user will fail for the same reason.

**Security note:** Sending an OTP to an existing user verifies email ownership and creates a session. It does not modify the user's password, trader workspace, or any other academy's data. The mentor's existing password remains unchanged.

---

## Pre-Implementation Investigation

Before writing any code, confirm the following by reading the current files:

1. `app/api/student/register/route.ts` — Locate the existing-user return statement (currently around line 175). Confirm it returns `{ status: "accepted", email: input.email, existingUser: true }` with no OTP send. Confirm `hashAccountSetupValue` and `canSendAuthEmail` are already imported. Confirm `existingUserId` is available in scope at that point.

2. `components/student-registration-form.tsx` — Locate the `if (payload.existingUser === true) { setDone(true) }` branch. Locate `verifyOtp({ type: "signup" })`. Confirm the `done` state, `setDone`, and the `if (done)` JSX block. Confirm the `submittedEmail` state exists.

3. `docs/AUTHENTICATION.md` — Locate the line that reads `verifyOtp({ type: "signup" })` in the "Inline student registration" bullet.

Report these findings before touching any file.

---

## Change 1 — `app/api/student/register/route.ts`

In the existing-user block, immediately before the final `return NextResponse.json(...)` statement, insert the OTP send:

```typescript
// Send OTP — same delivery gate as new-user path.
const deliveryAllowed = await canSendAuthEmail(admin, existingUserId);
if (deliveryAllowed) {
  const { error: otpError } = await admin.auth.signInWithOtp({
    email: input.email,
    options: { shouldCreateUser: false },
  });
  await admin.from("auth_challenge_events").insert({
    user_id: existingUserId,
    purpose: "student_registration",
    event_type: otpError ? "provider_error" : "requested",
    email_hash: hashAccountSetupValue(input.email),
    metadata: otpError
      ? { provider: "supabase_auth", error_code: "delivery_failed" }
      : {},
  });
} else {
  await admin.from("auth_challenge_events").insert({
    user_id: existingUserId,
    purpose: "student_registration",
    event_type: "suppressed",
    email_hash: hashAccountSetupValue(input.email),
    metadata: { reason: "auth_email_canary_gate" },
  });
}
```

The `return NextResponse.json({ status: "accepted", email: input.email, existingUser: true }, { status: 202 })` that follows is unchanged. `existingUser: true` remains in the response so the form can display a different heading.

**No other changes to this file.**

---

## Change 2 — `components/student-registration-form.tsx`

### 2a — Track the `isExistingUser` flag

Add a new piece of state near the top of the component (alongside `done`, `otpScreen`, etc.):

```typescript
const [isExistingUser, setIsExistingUser] = useState(false);
```

### 2b — Replace the post-submit branch

Change the existing-user branch in the `submit` function:

```typescript
// BEFORE
if (payload.existingUser === true) {
  setDone(true);
} else {
  setOtpScreen(true);
}
```

```typescript
// AFTER
const wasExisting = payload.existingUser === true;
setIsExistingUser(wasExisting);
setOtpScreen(true);
```

Both new and existing users now proceed to the OTP screen.

### 2c — Remove the `done` state and its JSX block

Remove:
- `const [done, setDone] = useState(false);`
- The `if (done) { return (...) }` block (the "You already have a KaiMentors account" screen)

### 2d — Personalise the OTP screen heading for existing users

In the `if (otpScreen)` JSX block, update the heading to reflect the user's state:

```tsx
<h2>{isExistingUser ? "Welcome back — check your inbox" : "Check your inbox"}</h2>
```

The supporting copy `<p>We sent a 6-digit code to <strong>{submittedEmail}</strong>.</p>` is unchanged.

### 2e — Fix `verifyOtp` type

The correct type depends on whether the user account is confirmed:

- **New student (unconfirmed):** `signInWithOtp` sent the "Confirm signup" template. Token hash type is `signup`. Must verify with `type: "signup"`.
- **Existing user (confirmed):** `signInWithOtp` sent the "Magic Link" template. Token hash type is `email`. Must verify with `type: "email"`.

Using the wrong type results in a hash mismatch and a verification failure.

Change the `verifyOtp` call:

```typescript
// BEFORE
const { error } = await supabase.auth.verifyOtp({
  email: submittedEmail,
  token: otpCode.trim(),
  type: "signup",
});
```

```typescript
// AFTER
const { error } = await supabase.auth.verifyOtp({
  email: submittedEmail,
  token: otpCode.trim(),
  type: isExistingUser ? "email" : "signup",
});
```

**No other changes to this file.**

---

## Change 3 — `docs/AUTHENTICATION.md`

In the "Inline student registration" bullet under "Supported code-entry flows", update the verifyOtp description:

**Before:**
```
The browser calls `verifyOtp({ type: "signup" })` directly against Supabase Auth to activate the account and redirect to the student portal — no `/account-setup` visit required.
```

**After:**
```
The browser calls `verifyOtp` directly against Supabase Auth to activate the account and redirect to the student portal — no `/account-setup` visit required. New students (unconfirmed accounts) use `type: "signup"`; existing users (confirmed accounts) use `type: "email"`. The correct type is selected automatically based on the `existingUser` flag returned by the registration API.
```

Also update the sentence in the "Unified Resume Account Setup" section that reads:

**Before:**
```
Student registration sets a password at the time of account creation; OTP verification via `verifyOtp({ type: "signup" })` then activates the unconfirmed account.
```

**After:**
```
Student registration sets a password at the time of account creation; OTP verification then activates the account. Unconfirmed new accounts use `type: "signup"`; pre-existing confirmed accounts use `type: "email"`.
```

Update the "Last updated" date to `2026-06-25`.

---

## What Is NOT Changing

- No database migration.
- `app/api/student/resend-otp/route.ts` — unchanged. Resend already works for all users.
- Mentor accounts, passwords, workspace data — unaffected.
- `middleware.ts`, `/account-setup`, `/dashboard` — unchanged.
- All EP-016 dual-role login fixes — unchanged.

---

## Acceptance Criteria

Test all scenarios against the **KaiTrades** academy. Do not use Traders Confidence or Milkers FX as test fixtures.

**Scenario 1 — Existing confirmed user (mentor registers as student)**  
Register at the KaiTrades join page using a mentor email that already has a confirmed account (e.g., a KaiTrades trader).  
Expected: OTP screen appears (not the "sign in with password" screen). Heading reads "Welcome back — check your inbox".

**Scenario 2 — Existing user OTP verifies and routes correctly**  
Enter the 6-digit code from the mentor's inbox.  
Expected: Verification succeeds. Redirected to the KaiTrades student portal (`/student?portal=kaitrades` or `/academy` on custom domain). Student dashboard loads.

**Scenario 3 — Mentor workspace unaffected**  
After completing scenario 2, sign in to the Traders Confidence mentor workspace at `/portal/tradersconfidence/login` using the mentor's original password.  
Expected: Signs in successfully. Mentor dashboard loads. Password unchanged.

**Scenario 4 — Resend code works for existing users**  
From the OTP screen after an existing-user registration, click "Resend code".  
Expected: A new code arrives in the inbox. Entering it completes verification correctly.

**Scenario 5 — New email (no existing account) — no regression**  
Register with a fresh email that has no Supabase Auth account.  
Expected: OTP screen appears with heading "Check your inbox". Entering the correct code completes signup and redirects to the student portal. `verifyOtp` type `"signup"` path exercised.

**Scenario 6 — Wrong code on existing-user path**  
Enter an incorrect 6-digit code for an existing-user OTP.  
Expected: Inline error message. User remains on OTP screen.

**Scenario 7 — Build and typecheck**  
`npm run typecheck` passes with no new errors.  
`npm run build` completes cleanly.

**Scenario 8 — Acceptance runner**  
`npm test` (or equivalent) passes with no modifications to test files. If test 15 references `type: "signup"` unconditionally, update it to accept the conditional type behaviour.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

1. Pre-implementation investigation findings (lines and imports as described).
2. Existing-user OTP send added to `register/route.ts` with `canSendAuthEmail` gate and audit row — exact line inserted.
3. `done` state and JSX block removed from `student-registration-form.tsx`.
4. `isExistingUser` state added; `setOtpScreen(true)` called for all registrations.
5. OTP screen heading conditional: "Welcome back — check your inbox" vs "Check your inbox".
6. `verifyOtp` type changed to `isExistingUser ? "email" : "signup"`.
7. `AUTHENTICATION.md` updated — both affected sentences changed, date updated.
8. Acceptance criteria 1–8 verified in browser against KaiTrades.
9. Commit hash and files changed.
