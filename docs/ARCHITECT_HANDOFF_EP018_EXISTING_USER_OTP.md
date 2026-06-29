# Architect Handoff — EP-018: Existing-User OTP Fix
**Status:** Ready for Engineering  
**Date:** 2026-06-25  
**Product Owner:** KaiMentors Product Owner  
**Depends on:** EP-017 (Inline Password + OTP Registration) — already deployed

---

## Objective

Fix two bugs introduced in EP-017:

1. **Existing-user path sends no OTP.** When a mentor registers at a student portal using the same email as their mentor account, the form shows a "use your existing password" screen. The user just typed a brand-new password into the registration form. They try to sign in with it. It fails — because the existing-user path discards the password they entered and their old account password is still what Supabase has. This is a UX failure and a real login blocker.

2. **`verifyOtp` type mismatch.** The registration form calls `supabase.auth.verifyOtp({ type: "signup" })` but the OTP was sent via `admin.auth.signInWithOtp`. The correct type for verifying an OTP sent by `signInWithOtp` is `"email"`. This mismatch may cause OTP verification to fail for new users on some Supabase configurations, and it has not been tested end-to-end in a real browser session.

---

## Security Clarification

Sending an OTP to an existing user verifies email ownership and creates a new session. It does **not** change the user's password. The mentor's existing password and their mentor workspace are completely unaffected.

Multi-tenant isolation is preserved: the OTP signs the user into their own auth session, and the subsequent redirect goes to the student portal of the academy they registered for. Nothing from their mentor workspace is queried, exposed, or affected.

---

## Current State (post EP-017)

### `app/api/student/register/route.ts` — existing-user path (lines 135–178)
```typescript
// Existing user: create student_applications row, do NOT send OTP, return existingUser: true
return NextResponse.json(
  { status: "accepted", email: input.email, existingUser: true },
  { status: 202 },
);
```

### `components/student-registration-form.tsx`
```typescript
// After submit — existing user branch
if (payload.existingUser === true) {
  setDone(true);  // shows "use your existing password" screen
} else {
  setOtpScreen(true);  // shows OTP entry screen
}

// OTP verification — type mismatch
const { error } = await supabase.auth.verifyOtp({
  email: submittedEmail,
  token: otpCode.trim(),
  type: "signup",  // ← WRONG for signInWithOtp
});
```

---

## Scope of Changes

### 1. `app/api/student/register/route.ts`

In the existing-user path, after creating or confirming the `student_applications` row, send an OTP before returning.

Replace the final return statement in the existing-user block (currently at line ~175):

```typescript
// BEFORE
return NextResponse.json(
  { status: "accepted", email: input.email, existingUser: true },
  { status: 202 },
);
```

```typescript
// AFTER — send OTP, same gate as new-user path
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

return NextResponse.json(
  { status: "accepted", email: input.email, existingUser: true },
  { status: 202 },
);
```

`existingUser: true` is kept in the response so the form can display a different heading ("Welcome back — check your inbox" instead of "Check your inbox") if desired.

### 2. `components/student-registration-form.tsx`

**A. Remove the `done` state branch entirely.** Existing users now go to the OTP screen the same as new users.

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
setOtpScreen(true);
// existingUser flag can be stored to personalise OTP heading if desired:
// setIsExistingUser(payload.existingUser === true);
```

The `done` state, `setDone`, and the `if (done)` JSX block can be removed entirely.

**B. Fix `verifyOtp` type.** Change `type: "signup"` to `type: "email"`:

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
  type: "email",
});
```

`type: "email"` is the correct verification type for OTPs sent via `signInWithOtp`. It works for both confirmed and unconfirmed users in `@supabase/auth-js` v2.49.4.

---

## What Is NOT Changing

- No database migration required.
- `app/api/student/resend-otp/route.ts` — unchanged. Resend works for existing users already.
- Mentor accounts, passwords, workspace data — completely unaffected.
- `/account-setup`, `/dashboard`, middleware — unchanged.
- All EP-016 dual-role login fixes — unchanged.
- Multi-tenant isolation — unchanged.

---

## Acceptance Criteria

1. A TC mentor (e.g. `nyaristo01@gmail.com`) registers at the KaiTrades join page. After submitting, the **OTP screen** appears — not a "sign in with your password" screen.
2. The mentor enters the 6-digit code from their inbox. Verification succeeds. They are redirected to `/student?portal=kaitrades` and see the KaiTrades student dashboard.
3. After completing the flow, signing in to the Traders Confidence mentor workspace (`/portal/tradersconfidence/login` or `/dashboard`) still works with the mentor's original password — it is unchanged.
4. Resend code works from the OTP screen for existing users.
5. A brand-new email (no existing account) still completes the full OTP flow and lands on the student portal — no regression.
6. `npm run typecheck` and `npm run build` pass with no new errors.
7. Existing acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

- Existing-user path now sends OTP via `signInWithOtp` with `canSendAuthEmail` gate
- `auth_challenge_events` row written for existing-user OTP (same as new user)
- Form no longer shows "use your existing password" screen — OTP screen shown for all registrations
- `verifyOtp` changed to `type: "email"`
- Acceptance criteria 1–7 verified in browser against KaiTrades
- Commit hash and files changed
