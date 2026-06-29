# Architect Handoff — Inline Password + OTP Registration
**Status:** Ready for Architect Review  
**Date:** 2026-06-25  
**Product Owner:** KaiMentors Product Owner  

---

## Objective

Students currently register on the academy page and are then redirected to `kaimentors.vercel.app/account-setup` — a mentor-focused platform page — to set their password. This breaks the academy-specific experience and exposes students to platform-internal copy and branding.

The new flow keeps students on the academy page throughout:

1. Student fills in Profile (name, email, phone, **password**), Experience, Review + consent
2. On submit → account created → OTP sent to email → inline OTP entry screen on the same page
3. Student enters 6-digit code → verified → redirect straight to student portal
4. No `/account-setup` page involved. No platform redirect.

---

## Current State

- `StudentRegistrationForm` creates a user with no password (`createUser({ email_confirm: false })` — no password field)
- After registration, the form redirects to `/account-setup` where the student sets their password via OTP
- `/account-setup` is designed for mentors — copy refers to workspaces, packages, and invitations
- Students are forced through a mentor-branded flow before reaching their portal

---

## Security Analysis

**Auth posture change:** The current flow creates an account with no password, then requires OTP to set one. The new flow creates an account with a password immediately, then uses OTP to verify email ownership.

This is a standard, well-established auth pattern (email + password signup with email verification). It is not a security downgrade — it simply reorders when the password is set relative to email confirmation.

**What the Architect must verify:**

1. `createUser` with a password and `email_confirm: false` — user can authenticate with the password immediately before verifying their email. Verify that protected routes (`/student`, `/dashboard`, `/admin`) enforce email confirmation status OR that the OTP verification step at the end of registration is sufficient to prevent an unconfirmed user from accessing the portal.

   Recommended position: after `verifyOtp` succeeds on the client, the user's email is confirmed in Supabase. The redirect to `/student` happens only after this. Middleware's existing session check (`supabase.auth.getUser()`) will see a confirmed, authenticated session. This is safe.

2. **Password minimum length:** enforce minimum 10 characters both client-side and in the Zod schema server-side. The API must reject passwords shorter than 10 characters before calling `createUser`.

3. **OTP resend rate limiting:** the new `/api/student/resend-otp` endpoint must use the existing `auth_challenge_events` table to enforce one resend per 60 seconds per email. This is the same pattern used in `/api/account-setup/start`. The Architect must confirm the rate-limit logic is applied correctly and that the endpoint does not leak whether an email is registered (always return 202 regardless of outcome).

4. **Existing user path:** when a registration is submitted with an email that already exists, the API creates the `student_applications` row for the existing user but does NOT send an OTP (the existing user already has a confirmed email and a password). The form shows a "sign in with your existing password" screen. The Architect must confirm this path does not allow a bad actor to probe which emails are registered — the API response shape must be identical for new and existing users from the outside (both return 202 with `{ status: "accepted", email }`; only `existingUser: true` is added for the client to differentiate UI state, not to confirm account existence to an unauthenticated attacker. Since the registration form already requires the student to know their own email, this risk is acceptable).

5. **No `/account-setup` regression:** mentors using `/account-setup` are completely unaffected. The route is unchanged. The only change is that students no longer reach it through registration.

---

## Scope of Changes

### 1. `app/api/student/register/route.ts`

Add `password` to the Zod schema:
```typescript
password: z.string().min(10).max(128),
```

Change `createUser` to include the password:
```typescript
admin.auth.admin.createUser({
  email: input.email,
  password: input.password,
  email_confirm: false,
  user_metadata: { full_name: input.fullName, role: "student" },
})
```

After `student_applications` insert succeeds, send OTP for email verification:
```typescript
await admin.auth.signInWithOtp({
  email: input.email,
  options: { shouldCreateUser: false },
});
```

OTP send failure is non-fatal — the application is already created and the student can use the resend endpoint. Log the failure but do not roll back.

**Existing user path:** after creating the `student_applications` row for an existing user, do NOT send OTP. Return `{ status: "accepted", email, existingUser: true }` with 202.

### 2. New `app/api/student/resend-otp/route.ts`

POST endpoint. Accepts `{ email: string }`.

Rate limiting using `auth_challenge_events`:
- Hash the email (same `hashAccountSetupValue` utility already used in `/api/account-setup/start`)
- Check for a recent event with `purpose = "student_otp"` and `event_type IN ("requested", "resend_requested")` within the last 60 seconds
- If found: return 202 silently (do not reveal rate limiting to the caller — just don't send)
- If not found: call `admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`, insert audit event

Always return 202 regardless of outcome. Never return an error that leaks account existence.

### 3. `components/student-registration-form.tsx`

**Steps:** `["Profile", "Experience", "Review"]` — unchanged count.

**Step 1 (Profile)** — add below phone number:
- Password field (`type="password"`, `minLength={10}`, `autoComplete="new-password"`)
- Confirm password field (`type="password"`, `minLength={10}`, `autoComplete="new-password"`)

`step1Valid` — add: `password.length >= 10 && password === passwordConfirmation`

**Post-submit state — OTP screen** (replaces all step content, not a numbered step):
- Icon + "Check your inbox" heading
- Shows the student's email address
- 6-digit code input
- "Verify and continue" button (disabled until 6 digits entered)
- "Resend code" button (always visible, no client-side cooldown needed — the server enforces it)
- Inline error display

**OTP verification (client-side):**
```typescript
const supabase = createClient();
const { error } = await supabase.auth.verifyOtp({
  email,
  token: otpCode.trim(),
  type: "email",
});
if (error) throw new Error("The code is incorrect or has expired.");
window.location.href = studentDestination;
```

**Existing user screen** (when `payload.existingUser === true` after submit):
- "Application submitted!" with a sign-in link to the academy login page
- No OTP step

**Props to add:** `loginPath: string`, `academyName: string`, `studentDestination: string`

Remove: `useRouter`, all `sessionStorage` writes, the `setTimeout` redirect.

### 4. `components/academy-join-page.tsx`

Pass the three new props to `<StudentRegistrationForm />`:
- `loginPath` — the academy login URL (already computed as `loginHref`)
- `academyName` — `data.portal.portal_name`
- `studentDestination` — `studentPortalPath` (already computed)

### 5. `app/account-setup/page.tsx` and `components/account-setup-flow.tsx`

**No changes.** The student never reaches this page through registration. The page continues to serve mentors completing workspace setup. No copy changes needed — the student context problem is solved by keeping students off this page entirely.

---

## Database Changes

**No migration required.**

The `auth_challenge_events` table already exists and supports any `purpose` value (it is a text field, not an enum). Using `purpose = "student_otp"` for the new resend rate-limit events requires no schema change.

---

## RLS & Security

- The `resend-otp` endpoint uses the admin client for `signInWithOtp` — this is consistent with how `/api/account-setup/start` operates. No user auth token is required to call resend (the student may not yet be authenticated at that point).
- The `student_applications` insert is done via the admin client (already the case in the existing register route) — no RLS change needed.
- The OTP verification (`supabase.auth.verifyOtp`) is called client-side with the anon client — this is the standard Supabase pattern for email OTP verification.

---

## Multi-Tenancy

No cross-tenant risk. The registration route already validates `portalSlug` against a published portal and scopes the `student_applications` insert to that portal's `trader_id`. The `resend-otp` route does not touch tenant data.

---

## What Is NOT Changing

- `/api/account-setup/*` routes — unchanged
- `AccountSetupFlow` component — unchanged
- Mentor registration and onboarding — unchanged
- Middleware — unchanged
- All EP-016 dual-role login fixes — unchanged

---

## Acceptance Criteria

1. Step 1 of the KaiTrades registration form includes Password and Confirm password fields below phone number.
2. Step 1 Next button is disabled until password is ≥ 10 characters and both password fields match.
3. On submit, the API creates the auth user with the provided password and `email_confirm: false`, creates the `student_applications` row, and sends an OTP to the student's email.
4. The form transitions to the OTP screen inline — no redirect to any other page.
5. Entering the correct 6-digit code verifies the student's email and redirects them to the student portal.
6. Entering an incorrect code shows an inline error. The student remains on the OTP screen.
7. "Resend code" sends a fresh OTP. A second resend within 60 seconds is silently suppressed server-side.
8. A registration attempt with an existing email creates the `student_applications` row (EP-016 behaviour) and shows the "You already have an account — sign in" screen. No OTP is sent.
9. Mentors navigating to `/account-setup` directly experience no change in behaviour.
10. A Traders Confidence mentor logging in via the TC academy login is still routed to their mentor dashboard (EP-016 unchanged).
11. `npm run typecheck` and `npm run build` pass with no new errors.
12. Existing KaiTrades acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:
- `password` field accepted and enforced (min 10 chars) in both API and form
- User created with password in Supabase Auth
- OTP sent after successful registration
- OTP inline verification working — redirect to student portal on success
- `resend-otp` endpoint rate-limited via `auth_challenge_events`
- Existing user path shows sign-in screen, no OTP sent
- No regression on `/account-setup` mentor flow
- Acceptance criteria 1–12 verified against KaiTrades test environment
- Commit hash and files changed
