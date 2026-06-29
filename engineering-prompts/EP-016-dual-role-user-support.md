# Engineering Prompt EP-016 — Dual-Role User Support

**Issued by:** KaiMentors Enterprise Architect  
**Date:** 2026-06-25  
**Priority:** High — production bug affecting real users  
**No DB migration required** — all changes are application-layer logic  
**Estimated scope:** Medium — 5–6 files, three targeted bug fixes

---

## ARCHITECT'S PRE-DELIVERY NOTES

The handoff is accurate and well-scoped. Three corrections the Architect adds before Engineering begins:

**Correction 1 — Use `getUserByEmail()` for existing user lookup, not `listUsers()` or `profiles` query.**  
The handoff proposes `admin.auth.admin.listUsers()` or a `profiles` email lookup to find an existing user after a duplicate registration attempt. Both have problems: `listUsers()` paginates and is expensive; `profiles.email` has no documented index on the `profiles` table. The correct approach is `admin.auth.admin.getUserByEmail(email)` — a direct Auth Admin API call designed exactly for this purpose. Use this in Fix 1.

**Correction 2 — Edge Runtime risk in middleware Fix 3.**  
The proposed middleware fix adds a `student_applications` COUNT query in Edge Runtime. The previous middleware loop was caused by exactly this pattern — a DB query in Edge Runtime JWT context silently misbehaving. The handoff acknowledges this is a rare code path (traders on `/student`) and considers it acceptable. Engineering must be aware of this risk and **test Fix 3 explicitly with a trader-student account in the KaiTrades environment** before marking it complete. If the count query proves unreliable in Edge Runtime, the fallback architecture is described in Section 6c — let middleware pass all authenticated users through to `/student`, and let the student portal server component redirect to `/dashboard` if no application is found. That approach is safer but produces a full page load before the redirect.

**Correction 3 — Update card header text in `academy-login-page.tsx`.**  
The current card header says "Student login" (eyebrow) and "This login is only for students of {academy}. Mentor and platform accounts must use the KaiMentors platform login." After Fix 2, mentors CAN log in from this page and will be routed to their dashboard. Both lines are now incorrect. They must be updated. The handoff does not mention this change — Engineering must include it.

---

## 1. Task Title

Dual-Role User Support — Context-Aware Academy Login Routing, Existing-User Registration Handling, and Middleware Trader-Student Pass-Through

---

## 2. Business Objective

A Traders Confidence mentor registered their TC email as a student at KaiTrades. Three sequential failures prevented this from working:

1. The registration API silently dropped the student application when the email was already registered — the user got a 202 but no application was created.
2. The academy login form hard-blocked anyone whose `profiles.role` was not `"student"` — no mentor could ever sign in from an academy login page, even as a legitimate student of that academy.
3. The middleware unconditionally redirected traders away from `/student` — even if they held a valid student application.

These three bugs together mean: a person who holds a mentor role on the platform can never be a student at a different (or the same) academy. This is wrong. The system must route each user based on their relationship to the specific academy they are logging into — not their global platform role.

---

## 3. Current State and Problems

**Read these files before touching anything:**
- `middleware.ts` — current student route guard (line 156–166)
- `components/login-form.tsx` — current allowedRole block (lines 44–61)
- `components/academy-login-page.tsx` — current LoginForm props
- `app/api/student/register/route.ts` — current duplicate-email guard (lines 162–172)
- `app/student/page.tsx` — current application query (EP-014 version)
- `docs/SECURITY.md`
- `docs/MULTI_TENANCY.md`

**Run these greps first:**
```bash
grep -r "allowedRole" components/ app/
grep -r "academyTraderId" components/ app/
grep -r "LoginForm" components/ app/
```
Confirm exactly which files use `allowedRole` and `academyTraderId` on `LoginForm`. If any callers other than `academy-login-page.tsx` exist, list them in the delivery summary. Do not break them.

### Bug 1 — Register route: existing user silently loses their application

`app/api/student/register/route.ts`, lines 162–172:
```typescript
const isDuplicate = createError?.message.toLowerCase().includes("already");
if (isDuplicate) {
  return NextResponse.json(
    { status: "accepted", email: input.email },
    { status: 202 },
  );
}
```
When an existing user (e.g., a trader) submits the registration form, `createUser` fails with a "already registered" error, and the route returns 202 immediately. The `student_applications` INSERT never executes. The user gets a success response but has no application.

### Bug 2 — Login form: hard blocks non-student roles before checking academy relationship

`components/login-form.tsx`, lines 44–49:
```typescript
if (allowedRole && profile?.role !== allowedRole) {
  await supabase.auth.signOut();
  throw new Error(
    "This login is for academy students. Mentor accounts must use the KaiMentors platform login.",
  );
}
```
A trader logging into an academy login page — even as a legitimate enrolled student — gets signed out immediately. The `student_applications` check on lines 50–61 is unreachable for non-student roles.

### Bug 3 — Middleware: traders redirected away from /student regardless of student applications

`middleware.ts`, lines 156–166:
```typescript
if (logicalPath.startsWith("/student") && profile?.role !== "student") {
  const platformUrl = ...;
  const destination =
    profile?.role === "super_admin" ? "/admin" : "/dashboard";
  return copyCookies(
    response,
    NextResponse.redirect(new URL(destination, platformUrl)),
  );
}
```
A trader with a valid `student_applications` row is unconditionally redirected to `/dashboard`. They can never reach `/student`.

---

## 4. Root Cause Investigation Requirements

Before writing any code, Engineering must:

1. Run the greps in Section 3 — confirm all callers of `LoginForm` with `allowedRole` or `academyTraderId`.
2. Confirm `profiles.email` is populated for existing users:
   ```sql
   SELECT id, email, role FROM profiles WHERE email = '<tc mentor email>' LIMIT 1;
   ```
3. Confirm the `student_applications` `unique(trader_id, student_user_id)` constraint exists:
   ```sql
   SELECT conname, contype FROM pg_constraint
   WHERE conrelid = 'student_applications'::regclass AND contype = 'u';
   ```
4. Read the full `app/student/page.tsx` (EP-014 version) to understand the current application query before modifying it.
5. Confirm Edge Runtime behavior assumption: after writing Fix 3, **test it with a real trader-student account in KaiTrades before marking complete**. Do not approve Fix 3 based on TypeScript passing alone.

---

## 5. Existing Architecture to Respect

### `profiles.role` is immutable for routing purposes
`profiles.role` reflects how the user joined the platform. It does not change when someone acquires a student role at an academy. Academy-level access is determined solely by `student_applications` and `trader_members` rows — not by `profiles.role`.

### Multi-tenancy is enforced by table rows, not by platform role
A user is a mentor of Academy A if and only if a `trader_members` row exists with their `user_id` and Academy A's `trader_id`. A user is a student of Academy A if and only if a `student_applications` row exists with their `student_user_id` and Academy A's `trader_id`. These checks are independent and must always be scoped to the specific academy.

### No new DB objects
This fix requires no migrations, no new tables, no new columns, and no new RLS policies.

### Login form is used beyond the academy login page
The `LoginForm` component is also used for the platform `/login` page. The `allowedRole` code path must remain intact — only the academy login page (via the new `academyContext` prop) gets the new routing logic. Do not break the platform login flow.

---

## 6. Implementation Requirements

### 6a. Fix 1 — `app/api/student/register/route.ts`

Replace the duplicate-email guard with a full existing-user path.

**Step 1: Look up the existing user using the Auth Admin API:**
```typescript
const { data: existingUserData } = await admin.auth.admin.getUserByEmail(input.email);
const existingUser = existingUserData?.user ?? null;
if (!existingUser) {
  // getUserByEmail failed — fall through to generic error
  return NextResponse.json(
    { error: "Your account could not be created." },
    { status: 400 },
  );
}
```

Use `admin.auth.admin.getUserByEmail(input.email)` — not `listUsers()` and not a `profiles` table lookup. This is the Auth Admin API method designed for this purpose.

**Step 2: Check for an existing application at this portal:**
```typescript
const { data: existingApplication } = await admin
  .from("student_applications")
  .select("id")
  .eq("student_user_id", existingUser.id)
  .eq("portal_id", validPortal.id)
  .maybeSingle();

if (existingApplication) {
  // Already registered at this academy — return gracefully
  return NextResponse.json(
    { status: "accepted", email: input.email, existingUser: true },
    { status: 202 },
  );
}
```

**Step 3: Insert a new student_application for the existing user:**

Identical to the new-user application insert, with the following differences:
- `student_user_id: existingUser.id` (the existing user's ID, not a newly created one)
- `trader_broker_account_id: null` — consistent with EP-015 (no broker at signup)
- `broker_account_identifier: null`
- `trading_account_number: null`
- `platform_account_number: null`
- `status: 'pending'`
- No screenshot upload
- No `verification_attempts` insert — consistent with EP-015

Do NOT attempt to update the `profiles` row's `phone` for an existing user — this could overwrite their existing phone number. Skip the `profiles` update step entirely for the existing-user path.

Do NOT call `admin.auth.admin.deleteUser()` if the application insert fails for an existing user — that user was not created by this request and must not be deleted.

The rollback-on-failure guard must only apply to newly created users, not existing users. Ensure the rollback logic is scoped correctly:
```typescript
const isNewUser = !isDuplicate; // true only when createUser succeeded
// ...later in error handling:
if (isNewUser) await admin.auth.admin.deleteUser(createdUserId);
```

**Step 4: Return with `existingUser: true` flag:**
```typescript
return NextResponse.json(
  { status: "accepted", email: input.email, existingUser: true },
  { status: 202 },
);
```

### 6b. Fix 1b — `components/student-registration-form.tsx`

In the `submit` function, check the response payload for `existingUser`:

```typescript
if (payload.existingUser === true) {
  // Existing user — redirect to academy login, not account-setup
  // The studentPortalPath prop is already available; derive the login URL from it.
  // e.g. if studentPortalPath = "/academy" (custom domain) → "/login"
  //      if studentPortalPath = "/student?portal=kaitrades" → "/portal/kaitrades/login"
  // Use the loginHref that is already computed in the parent page context.
  // Since the form doesn't have direct access to the login href, Engineering must
  // either pass a `loginPath` prop to the form, or derive it from `studentPortalPath`.
  // Recommended: add a `loginPath?: string` prop to the form.
  setDone(true);
  // Use window.location.href — same pattern as successful verification in EP-015
  setTimeout(() => { window.location.href = loginPath ?? "/login"; }, 1500);
} else {
  setDone(true);
  setTimeout(() => router.push("/account-setup"), 1500);
}
```

The success message for existing users should differ:
```
New user: "Application submitted! Check your inbox to verify your email and create your password."
Existing user: "Application submitted! Use your existing KaiMentors password to sign in."
```

**Add a `loginPath` prop to `StudentRegistrationForm`:**
```typescript
interface RegistrationFormProps {
  portalSlug: string;
  primaryColor: string;
  studentPortalPath?: string;
  loginPath?: string;  // new — login URL for the academy; used when existingUser = true
}
```

Pass `loginPath` from `academy-join-page.tsx`:
```typescript
const loginHref = getAcademyEntryHref(routeContext, "login");
<StudentRegistrationForm
  loginPath={loginHref}
  portalSlug={data.portal.slug}
  primaryColor={data.portal.primary_color}
  studentPortalPath={studentPortalPath}
/>
```

### 6c. Fix 2 — `components/login-form.tsx`

**Add `academyContext` prop to the `LoginForm` interface:**
```typescript
academyContext?: {
  traderId: string;
  studentDestination: string;
  mentorDestination: string;
};
```

The existing `allowedRole` and `academyTraderId` props remain on the interface unchanged. The `academyContext` code path is additive — it only activates when `academyContext` is passed. When both `allowedRole` and `academyContext` are present, `academyContext` takes precedence. The simplest way to handle this: check `if (academyContext)` first and return from that branch before reaching the `allowedRole` check.

**Insert the `academyContext` branch after the profile load, before the existing `allowedRole` check:**

```typescript
if (academyContext) {
  // super_admin has no student or mentor relationship at client academies
  if (profile?.role === "super_admin") {
    await supabase.auth.signOut();
    throw new Error("Platform admin accounts cannot sign in here.");
  }

  // Priority 1: is this user a mentor/member of this academy?
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();

  if (membership) {
    window.location.href = academyContext.mentorDestination;
    return;
  }

  // Priority 2: is this user a student of this academy?
  const { data: application } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();

  if (application) {
    window.location.href = academyContext.studentDestination;
    return;
  }

  // Neither mentor nor student of this academy
  await supabase.auth.signOut();
  throw new Error(
    "No account found for this academy. If you've just applied, check your email to complete setup.",
  );
}
// Existing allowedRole logic follows unchanged...
```

**Priority is explicit:** mentor membership is checked first. If the same user is somehow both a mentor and a student at the same academy, they are routed to the mentor dashboard. This is correct — the mentor experience takes priority.

**Note on `trader_members` query in the browser client:** The login form uses `createClient()` from `@/lib/supabase/browser` — the authenticated user's browser session. `trader_members` RLS allows users to see their own memberships. This query is safe and does not have the Edge Runtime issues from middleware.

### 6d. Fix 2b — `components/academy-login-page.tsx`

**Replace the current `<LoginForm>` call:**

Current:
```typescript
<LoginForm
  academyTraderId={data.portal.trader_id}
  allowedRole="student"
  studentDestination={studentDestination}
  submitLabel="Sign In"
/>
```

Replace with:
```typescript
const mentorDashboardHref =
  customDomain && platformOrigin
    ? new URL("/dashboard", platformOrigin).toString()
    : "/dashboard";

<LoginForm
  academyContext={{
    traderId: data.portal.trader_id,
    studentDestination: studentDestination,
    mentorDestination: mentorDashboardHref,
  }}
  submitLabel="Sign In"
/>
```

`platformOrigin` is already defined in this component (`const platformOrigin = process.env.NEXT_PUBLIC_SITE_URL`). No new variable is needed.

**Update card header text (Correction 3 from Architect's Pre-Delivery Notes):**

The current card says:
- Eyebrow: "Student login"
- Paragraph: "This login is only for students of {academy}. Mentor and platform accounts must use the KaiMentors platform login."

These are both incorrect after the fix — mentors can now sign in here. Update to:
- Eyebrow: "Academy login" (or remove the eyebrow entirely)
- Paragraph: "Sign in to your {academy} account. You'll be directed to your mentor workspace or student portal based on your account type."

Adjust copy as needed for tone — but the key change is: no longer tells mentors to go elsewhere.

### 6e. Fix 3 — `middleware.ts`

**Replace the current student-route guard (lines 156–166):**

```typescript
if (logicalPath.startsWith("/student") && profile?.role !== "student") {
  const platformUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  if (profile?.role === "super_admin") {
    return copyCookies(
      response,
      NextResponse.redirect(new URL("/admin", platformUrl)),
    );
  }

  if (profile?.role === "trader") {
    // Allow traders through if they have at least one student_application.
    // The student portal server component handles academy context and redirects
    // gracefully if no matching application is found for the current context.
    const { count } = await supabase
      .from("student_applications")
      .select("id", { count: "exact", head: true })
      .eq("student_user_id", data.user.id)
      .limit(1);
    if (count && count > 0) {
      return response;
    }
  }

  // No student application found — redirect to appropriate destination
  const destination =
    profile?.role === "trader" ? "/dashboard" : "/login";
  const platformUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return copyCookies(
    response,
    NextResponse.redirect(new URL(destination, platformUrl)),
  );
}
```

**Edge Runtime warning:** This adds a DB query in Edge Runtime for traders on `/student` paths. The previous `trader_members` query failed silently in this context. Test this fix explicitly — see Section 4, point 5. If this query also behaves unreliably in Edge Runtime (returns 0 even when rows exist), use the fallback:

**Fallback architecture (if Edge Runtime count query is unreliable):**
```typescript
if (profile?.role === "trader") {
  // Pass through unconditionally — let the student portal server component
  // redirect to /dashboard if no application exists. Same pattern as
  // super_admin pass-through on /dashboard.
  return response;
}
```

The student portal server component (`app/student/page.tsx`) already redirects to login if no user is found. For the trader-with-no-application case, it would show an empty application state or can be extended to redirect to `/dashboard` if no application is found. This is the safer approach but produces an extra round-trip for traders navigating to `/student` who have no application. Engineering must choose the approach after testing Fix 3's Edge Runtime behavior.

### 6f. Multi-application handling — `app/student/page.tsx`

The current application query already uses `order("submitted_at", { ascending: false }).limit(1).maybeSingle()`. When no portal context is provided (`portalId = null`, `portalSlug = null`), this returns the most recent application across all academies.

Add a status preference to avoid surfacing a rejected application when an active one exists:

```typescript
// When no portal context is provided, prefer non-rejected applications
if (!academy.portalId && !academy.portalSlug) {
  appQuery = appQuery.neq("status", "rejected");
}
```

This is a minor change. If the student only has rejected applications, the query returns null — the page shows the unauthenticated/no-application state (which is acceptable; they can navigate with a `?portal=slug` param to see the specific rejected application).

If no portal context AND the student has applications at multiple academies, the most recent non-rejected one is shown. This is the documented acceptable simplification for this release. The full multi-academy switching UI is a future feature.

---

## 7. Database and Migration Requirements

**No migration required.** This prompt makes no schema changes.

If Engineering discovers during implementation that a constraint check (e.g., the `unique(trader_id, student_user_id)` constraint on `student_applications`) is missing and needs adding, that is a separate migration outside this prompt's scope. Flag it to the Architect rather than silently adding it.

---

## 8. RLS and Security Requirements

### 8a. `academyContext.traderId` is not a secret

`traderId` is rendered server-side into the page props and visible in the HTML source. This is acceptable — it is not a credential and confers no authorization. The `trader_members` and `student_applications` queries in the login form use the authenticated user's session with RLS applied. A user cannot gain access to an academy's student portal by knowing its `traderId` alone.

### 8b. Student portal data isolation remains unchanged

A trader accessing `/student` operates as a student in that context. They see only their own `student_applications` row(s). They have no elevated permissions derived from their `trader` role inside the student portal. The student portal server components never check `profiles.role` to elevate access — they scope entirely to `student_applications`. No changes to RLS policies are needed.

### 8c. `super_admin` explicitly blocked from academy login

The `academyContext` code path in `login-form.tsx` signs out and throws for `super_admin` users. Platform admins should never appear as students or mentors at client academies. This block is correct and intentional.

### 8d. Cross-academy application check on `/student` middleware

The middleware Fix 3 only checks whether the trader has ANY student application — it does not validate which academy they belong to. This is intentional: the middleware's job is existence check only. The student portal server component validates the specific academy via `portalId`/`portalSlug` filtering. This is the correct separation of concerns.

### 8e. No duplicate application creation

The register route Fix 1 checks for an existing `student_applications` row at `(student_user_id, portal_id)` before inserting. The DB `unique(trader_id, student_user_id)` constraint is a final safety net. Both layers of protection must be in place.

---

## 9. Multi-Tenancy Requirements

- The `academyContext.traderId` passed to `LoginForm` is the specific academy's `trader_id`. Both the `trader_members` and `student_applications` checks in Fix 2 filter on this `trader_id`. A user's membership at Academy A grants no access to Academy B.
- The student portal multi-application handling (Section 6f) defaults to most-recent-non-rejected when no portal context is specified. When a `?portal=slug` query parameter is present (which it is in all navigation from inside the student portal), the query is scoped to the specific portal. Multi-tenancy is preserved.
- The registration Fix 1 uses `validPortal.id` (resolved from the submitted `portalSlug`) as the `portal_id` for the new application. It is not possible to register at a different academy by manipulating the form submission — `validPortal` is always resolved server-side.

---

## 10. Authentication and Authorization

- `login-form.tsx` uses `createClient()` from `@/lib/supabase/browser` — the browser client. The `trader_members` and `student_applications` queries use the user's session and are RLS-filtered.
- `middleware.ts` uses `createServerClient` (SSR client). The `student_applications` count query in Edge Runtime may behave differently than in a server component — see Section 6e and Correction 2.
- `app/api/student/register/route.ts` uses `createAdminClient` — all DB operations are service-role. The `getUserByEmail()` call is an Auth Admin API call, not a DB query.

---

## 11. API and Integration Requirements

### Modified: `POST /api/student/register`
- On duplicate email: look up existing user via `admin.auth.admin.getUserByEmail(email)`
- Check for existing application; return 202 with `existingUser: true` if found
- Otherwise: insert new `student_applications` row for the existing user
- Do NOT call `profiles` update for existing users
- Do NOT call `admin.auth.admin.deleteUser()` for existing users on failure
- Return `{ status: "accepted", email, existingUser: true }` with 202

No other API routes change.

---

## 12. UI/UX and Accessibility Requirements

### Academy login card header update
- Eyebrow: change from "Student login" to "Academy login" (or remove)
- Paragraph: update to reflect dual routing — both students and mentors of this academy can sign in here
- Mentor-specific error message: "Platform admin accounts cannot sign in here." (for super_admin)
- Unregistered error message: "No account found for this academy. If you've just applied, check your email to complete setup."

### Registration form — existing user success state
- Different copy for `existingUser: true` (see Section 6b)
- Redirect to academy login, not account-setup
- Same `CheckCircle2` success icon and green styling

### No other UI changes
All other pages and layouts are unaffected by this prompt.

---

## 13. Storage and Audit Requirements

No new storage operations. No storage policy changes.

**Audit logging:** The existing-user application insert in Fix 1 should follow the same audit pattern as a new-user registration if the project uses application-level audit logging for registrations. Check whether `write_audit_log` is called in the current register route and, if so, include it in the existing-user path as well.

---

## 14. Documentation Requirements

- **`docs/STUDENTS.md`**: Add a note under Registration Process — if a user with an existing KaiMentors account (any role) submits the registration form, a `student_applications` row is created for them without creating a new auth user. They are redirected to the academy login page, not to account-setup.
- **`docs/AUTHENTICATION.md`** (if it exists): Document the academy login dual-routing logic — `trader_members` checked first (routes to mentor dashboard), then `student_applications` (routes to student portal), then error.
- **`CHANGELOG.md`**: Entry for EP-016.
- **`PRODUCT_STATUS.md`**: Update as appropriate.

---

## 15. Testing and Regression Requirements

### TypeScript and build
```bash
npm run typecheck
npm run build
```
Both must pass with zero errors.

### New tests

**Fix 1 — Register route:**
- Existing trader submits KaiTrades registration form → application created with `trader_broker_account_id = null`, `status = 'pending'`, no new auth user
- Existing trader submits same form a second time → 202 with `existingUser: true`, no duplicate application (unique constraint respected)
- New student submits → existing behavior unchanged (auth user created, application created)
- `getUserByEmail` failure (unexpected) → returns 400 gracefully

**Fix 2 — Login form:**
- TC mentor logs into TC academy login → `trader_members` row found → routed to mentor dashboard
- TC mentor logs into KaiTrades academy login (where they have a student application) → no `trader_members` row → `student_applications` row found → routed to student portal
- User with no relationship to the academy → signed out → error shown
- super_admin logs into any academy login → signed out → "Platform admin accounts cannot sign in here."
- Platform `/login` page (no `academyContext` prop) → existing allowedRole logic unchanged

**Fix 3 — Middleware:**
- Trader with KaiTrades student application navigates to `/student` → middleware allows through
- Trader with no student application navigates to `/student` → redirected to `/dashboard`
- Student navigates to `/student` → unaffected (role check short-circuits before the new code)
- super_admin navigates to `/student` → redirected to `/admin` (unchanged)
- **Must be tested with a real trader-student account in KaiTrades** — not just via automated tests

### Regression tests
- New KaiTrades student signup (fresh email) → unchanged — redirected to `/account-setup`
- KaiTrades student logs into KaiTrades academy login → routed to student portal (existing behavior preserved)
- Platform `/login` with trader credentials → routed to `/dashboard` (allowedRole path unchanged)
- TC mentor logs into TC dashboard → unaffected — no middleware change for `/dashboard` path
- All existing acceptance runner tests pass without modification

---

## 16. Acceptance Criteria

- [ ] `admin.auth.admin.getUserByEmail(email)` used for existing-user lookup (not `listUsers`, not `profiles`)
- [ ] Existing trader submitting KaiTrades registration form: application created with null broker fields, `status = 'pending'`, no new auth user created
- [ ] Registration form redirects existing user to academy login, not `/account-setup`
- [ ] Registration form shows different success copy for existing vs new users
- [ ] Duplicate registration (same user, same portal) returns 202 without creating a second application
- [ ] `LoginForm` has new `academyContext` prop; existing `allowedRole` prop and logic unchanged
- [ ] TC mentor logging into TC academy login: routed to `/dashboard` (or full platform URL if custom domain)
- [ ] TC mentor logging into KaiTrades academy login (student there): routed to KaiTrades student portal
- [ ] User with no relationship to the academy: signed out, error message shown
- [ ] `super_admin` logging into any academy login: signed out, error shown
- [ ] Card header on `academy-login-page.tsx` updated — no longer says "Student login" or tells mentors to go elsewhere
- [ ] `mentorDashboardHref` uses full platform URL when on custom domain
- [ ] Middleware allows trader with student_application through to `/student`
- [ ] Middleware redirects trader with no student_application to `/dashboard`
- [ ] Fix 3 tested explicitly with a real KaiTrades trader-student account (not just automated tests)
- [ ] Multi-application query on `app/student/page.tsx`: excludes rejected applications when no portal context
- [ ] `npm run typecheck` passes — zero errors
- [ ] `npm run build` passes — zero errors
- [ ] All existing tests pass — zero regressions
- [ ] New tests for all three fix paths pass
- [ ] `docs/STUDENTS.md` updated
- [ ] `CHANGELOG.md` updated

---

## 17. Final Delivery Summary Required from Engineering

1. **Edge Runtime test result**: Describe how Fix 3 was tested with a real trader-student account. Did the `student_applications` count query work correctly in Edge Runtime? If the fallback (unconditional pass-through) was used instead, state why and what was observed.

2. **`getUserByEmail` confirmation**: Confirm `admin.auth.admin.getUserByEmail()` is the method used. Paste the call site (without credentials).

3. **Duplicate application prevention confirmation**: Paste the check-before-insert code from Fix 1 (the `maybeSingle` query on `student_applications` before the INSERT).

4. **`allowedRole` callers audit**: List all files that use `allowedRole` on `LoginForm` — confirm none were broken.

5. **Changed files list**: Every file created, modified, or deleted.

6. **TypeScript output**: Paste `npm run typecheck` — zero errors.

7. **Build output**: Paste `npm run build` — success.

8. **Test output**: All tests passing including new ones.

9. **Card header text**: Paste the updated eyebrow and paragraph text from `academy-login-page.tsx`.

10. **Acceptance criteria checklist**: Confirm each item is checked.

---

*End of EP-016 — Dual-Role User Support*
