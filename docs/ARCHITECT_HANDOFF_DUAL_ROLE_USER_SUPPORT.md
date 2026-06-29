# Architect Handoff — Dual-Role User Support
**Status:** Ready for Architect Review  
**Date:** 2026-06-25  
**Product Owner:** KaiMentors Product Owner  

---

## Objective

The academy login page must route each user to the correct destination based on their relationship to **that specific academy** — not their global platform role. If you're a mentor of the academy you're logging in from, you reach your mentor dashboard. If you're a student there, you reach the student portal. If you're both (edge case), mentor takes priority. If you're neither, you get a clear error.

This also means a person can hold a mentor role at one academy and a student role at a different academy using the same email address, and each login context routes them correctly without interference.

---

## What Happened (Verified Root Cause)

User registered their Traders Confidence mentor email as a student at KaiTrades. Three things failed in sequence:

1. **`app/api/student/register/route.ts` line 162** — duplicate-email guard returns 202 immediately when `createUser` fails with "already registered." The `student_applications` INSERT never executes. The student application does not exist.

2. **`components/login-form.tsx` line 44** — `if (allowedRole && profile?.role !== allowedRole)` hard-blocks any user whose `profiles.role` is not `student`. A trader logging in to an academy login page gets signed out with an error before any student-application check happens.

3. **`middleware.ts` line 156** — `if (logicalPath.startsWith("/student") && profile?.role !== "student")` unconditionally redirects traders away from `/student`. Even if the fix above goes in, a trader with a student_application cannot reach their student portal.

---

## Architecture Decision

**`profiles.role` stays as a single platform role.** It reflects how the user first joined KaiMentors (`super_admin`, `trader`, `student`). It does not change when someone acquires an additional student role at an academy.

**Student context is derived from `student_applications`.** A user has student access at a specific academy if a `student_applications` row exists with `student_user_id = auth.uid()` and `trader_id = <that academy's trader_id>`. This table already has `unique (trader_id, student_user_id)`, so one application per user per academy is enforced.

**No new tables or columns required.** All three fixes are logic changes to existing code.

---

## Scope of Changes

### Fix 1 — Registration API: handle existing user by creating student_application

**`app/api/student/register/route.ts`**

Replace the current duplicate-user guard:
```typescript
// CURRENT — silently drops the application
if (isDuplicate) {
  return NextResponse.json({ status: "accepted", email: input.email }, { status: 202 });
}
```

With the following logic:

1. If `createUser` fails with a duplicate error:
   a. Look up the existing user by email using `admin.auth.admin.listUsers()` or `admin.from("profiles").select("id").eq("email", input.email).maybeSingle()`.
   b. If the user is not found (shouldn't happen, but be safe): return 400.
   c. Check whether a `student_applications` row already exists for `(student_user_id = existingUserId, portal_id = validPortal.id)`. If it does: return `{ status: "accepted", email: input.email, existingUser: true }` with 202 — they've already registered.
   d. If no application exists yet: insert a new `student_applications` row using the existing user's ID exactly as if they were new, with the same fields (status `pending`, trader_id, portal_id, phone_number, trading_level, etc.). Do NOT attempt to upload a screenshot (they can do that from the dashboard). Do NOT create a `verification_attempts` row (consistent with EP-015 — no attempt at signup).
   e. Return `{ status: "accepted", email: input.email, existingUser: true }` with 202.

The `existingUser: true` flag in the response lets the frontend redirect appropriately (see Fix 1b below).

**`components/student-registration-form.tsx`**

After submit, check the response payload:
- If `payload.existingUser === true`: redirect to the academy login page (use `studentPortalPath` prop which is already available, replace `/student` suffix with `/login`) instead of `/account-setup`.
- If `payload.existingUser` is absent or false: existing behaviour — redirect to `/account-setup` to set a password.

The success screen copy can also be adjusted for existing users: "Your application has been submitted. Use your existing KaiMentors password to sign in."

---

### Fix 2 — Academy login: context-aware routing based on relationship to the specific academy

This is the core fix. The academy login page must route based on the user's relationship to **that academy**, not their global `profiles.role`.

**`components/academy-login-page.tsx`**

Remove `allowedRole="student"` from the `<LoginForm />` call entirely. The login form should not assume student-only context on an academy login page.

Pass a new prop instead: `academyContext` (object containing `traderId`, `studentDestination`, `mentorDestination`). This signals to the form that it should perform context-aware routing for this specific academy.

```tsx
<LoginForm
  academyContext={{
    traderId: data.portal.trader_id,
    studentDestination: studentDestination,
    mentorDestination: mentorDashboardHref,  // see below
  }}
  submitLabel="Sign In"
/>
```

`mentorDashboardHref` must resolve to the full platform URL for the mentor dashboard, because academy logins may happen from a custom domain where `/dashboard` would resolve incorrectly:
```typescript
const mentorDashboardHref =
  customDomain && platformOrigin
    ? new URL("/dashboard", platformOrigin).toString()
    : "/dashboard";
```

**`components/login-form.tsx`**

Add the `academyContext` prop to the `LoginForm` interface:
```typescript
academyContext?: {
  traderId: string;
  studentDestination: string;
  mentorDestination: string;
};
```

Replace the current role-block logic with academy-relationship logic. When `academyContext` is provided:

```typescript
if (academyContext) {
  // super_admin has no context at client academies — block explicitly
  if (profile?.role === "super_admin") {
    await supabase.auth.signOut();
    throw new Error("Platform admin accounts cannot sign in here.");
  }

  // Check 1: is this user a mentor/member of this academy?
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();

  if (membership) {
    // They are a mentor of this academy — send to mentor dashboard
    window.location.href = academyContext.mentorDestination;
    return;
  }

  // Check 2: is this user a student of this academy?
  const { data: application } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();

  if (application) {
    // They are a student of this academy — send to student portal
    window.location.href = academyContext.studentDestination;
    return;
  }

  // Neither mentor nor student of this academy
  await supabase.auth.signOut();
  throw new Error(
    "No account found for this academy. If you've just applied, check your email to complete setup."
  );
}
```

The existing `allowedRole` prop and its logic remain intact for any other callers that still use it. This is an additive change — `academyContext` is a new code path, not a replacement of the existing prop.

**Priority rule:** Mentor membership is checked first. If a user is a mentor of Academy A and somehow also has a student_application at Academy A (edge case), they are routed to the mentor dashboard. Student routing only applies if no mentor membership is found.

---

### Fix 3 — Middleware: allow traders with student_applications through to /student

**`middleware.ts`**

Replace:
```typescript
if (logicalPath.startsWith("/student") && profile?.role !== "student") {
  const destination = profile?.role === "super_admin" ? "/admin" : "/dashboard";
  return copyCookies(response, NextResponse.redirect(new URL(destination, platformUrl)));
}
```

With:
```typescript
if (logicalPath.startsWith("/student") && profile?.role !== "student") {
  if (profile?.role === "super_admin") {
    return copyCookies(response, NextResponse.redirect(new URL("/admin", platformUrl)));
  }

  if (profile?.role === "trader") {
    // Allow traders who have at least one student_application through.
    // The student portal pages are responsible for showing the correct academy context.
    const { count } = await supabase
      .from("student_applications")
      .select("id", { count: "exact", head: true })
      .eq("student_user_id", data.user.id)
      .limit(1);
    if (count && count > 0) {
      return response; // allow through — student portal pages handle context
    }
  }

  // No student application found — redirect to appropriate destination
  const destination = profile?.role === "trader" ? "/dashboard" : "/login";
  return copyCookies(response, NextResponse.redirect(new URL(destination, platformUrl)));
}
```

**Performance note:** This adds one lightweight `count` query (no rows returned, just existence check) per `/student/*` request where the authenticated user has `role = trader`. This is acceptable — traders on the student portal are rare. The query uses the existing RLS-filtered `student_applications` table and the primary key index on `student_user_id`.

---

### Multi-student-application edge case (future-proofing)

If a trader has student_applications at more than one academy, `/student` needs to show the right one. The student portal server component (`app/student/page.tsx`) currently loads the student's application. It must handle the multi-application case by:
- Checking the URL context if any (e.g., via a query param or a `/student/[traderId]` path in future)
- For now: loading the most recently created active application (not rejected), and displaying it

This is an acceptable simplification for the current release. The full multi-academy student switching UI is a future feature.

---

## Security Requirements

- A trader accessing `/student` may only see `student_applications` rows where `student_user_id = auth.uid()`. This is already enforced by RLS on `student_applications`.
- A trader accessing `/student` has no elevated permissions inside the student portal — they are a student in that context, not a mentor. The student portal pages must never read `trader_members` or expose mentor-only data based on the user's platform role.
- The `academyTraderId` check in the login form remains mandatory — a student application at Academy A must not grant login access to Academy B's student portal.
- `super_admin` accounts are explicitly blocked from academy student login (line added in Fix 2). Platform admins should never appear as students at client academies.
- The registration fix must not allow a user to create a second student_application at the same academy. The `unique (trader_id, student_user_id)` constraint on `student_applications` already enforces this at the DB level; the API should check first and return 202 gracefully rather than hitting the constraint.

---

## Multi-Tenancy

- The student portal page loads student context via `student_applications.trader_id`. This already scopes all data to a single academy.
- A trader's mentor data (their courses, students, etc.) is loaded via `trader_members`. These are completely separate queries and separate UI paths. A trader-student cannot reach mentor data through the student portal.
- No changes to RLS policies are required.

---

## No Database Migration Required

All three fixes are application-level logic changes. No schema changes, no new columns, no new tables.

---

## Files Changed

- `app/api/student/register/route.ts` — existing-user handling in duplicate guard
- `components/student-registration-form.tsx` — redirect to login vs account-setup based on `existingUser` flag
- `components/academy-login-page.tsx` — remove `allowedRole="student"`, pass new `academyContext` prop with `mentorDestination` resolved to full platform URL for custom domains
- `components/login-form.tsx` — add `academyContext` prop; new code path checks `trader_members` then `student_applications` for the specific academy and routes accordingly
- `middleware.ts` — add student_applications count check for trader users on /student routes
- `app/student/page.tsx` — handle multiple student_applications gracefully (show most recent active)

---

## Acceptance Criteria

**Mentor routing from academy login:**
1. A Traders Confidence mentor visits the Traders Confidence academy login page, enters their credentials, and is redirected to their mentor dashboard (`/dashboard`). They do not see a student portal or an error.
2. The same mentor visits the KaiTrades academy login page and logs in — they are routed to their KaiTrades student portal (not the TC mentor dashboard), because they are a student at KaiTrades.
3. A user with no relationship to an academy who attempts to log in via that academy's login page is signed out and shown "No account found for this academy."
4. `super_admin` accounts attempting to log in via any academy login page are signed out with a clear error.

**Registration of existing user:**
5. A KaiTrades test student with a fresh email completes signup and reaches `/account-setup` — existing behaviour unchanged.
6. A user already registered as a `trader` submits the KaiTrades registration form. A `student_applications` row is created for them at KaiTrades. No new auth user is created. The form redirects to the KaiTrades login page (not `/account-setup`).
7. A user attempting to submit a second registration at the same academy returns 202 without creating a duplicate application.

**Middleware and portal access:**
8. A trader with a KaiTrades student_application who navigates directly to `/student` is allowed through by middleware and sees their KaiTrades student dashboard.
9. A trader with no student_application anywhere who navigates directly to `/student` is redirected to `/dashboard`.
10. Inside `/student`, a trader-student sees only their student application data — no mentor workspace data is visible or accessible.
11. The same user navigating to `/dashboard` reaches their mentor workspace with no change in behaviour.

**Isolation:**
12. Traders Confidence students and KaiTrades students cannot access each other's data — confirmed by attempting a cross-academy student_applications read.

**Build:**
13. `npm run typecheck` and `npm run build` pass with no new errors.
14. Existing KaiTrades acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:
- All three fixes implemented
- No new auth users created for existing-email registrations
- student_application created correctly for existing-email registrations
- Middleware trader-student pass-through working
- Acceptance criteria 1–11 verified against KaiTrades test environment
- Commit hash and files changed
