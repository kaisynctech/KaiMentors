# EP-070 — Sign-out: Redirect to Academy Page

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Clicking "Sign out" on any page (mentor dashboard or student dashboard) redirects to `https://kaimentors.vercel.app/login` — the generic platform login — regardless of which academy the user was using.

The sign-out handler always does:

```typescript
return NextResponse.redirect(new URL("/login", request.url));
```

`request.url` is always the platform origin, so the redirect is always the platform `/login`.

After sign-out, users should land on their academy's public page (`/portal/{slug}`), not the generic login.

Exception: students on a custom domain (`basePath === "/academy"`) should redirect to `/login` on that domain — the middleware will rewrite this to the domain-specific login.

No migration. No schema changes.

---

## Scope

| File | Change |
|---|---|
| `app/auth/signout/route.ts` | Read `returnTo` from POST body; validate; redirect there |
| `components/student-shell-client.tsx` | Add `portalSlug?: string` prop; pass `returnTo` in sign-out form |
| `components/dashboard-shell.tsx` | Add `portalSlug?: string` prop; pass `returnTo` in sign-out form (trader mode only) |
| All `app/student/` pages that render `StudentShellClient` | Add `portalSlug={portal?.slug}` |
| All `app/dashboard/` pages that render `DashboardShell` (trader mode) | Add `portalSlug={portal.slug}` — `portal` already destructured from EP-069 |

---

## 1 — Signout route handler

**File:** `app/auth/signout/route.ts`

Replace the entire file:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isSafeRelativeUrl(value: string): boolean {
  // Must start with "/" and must not contain a protocol (prevent open redirect)
  return typeof value === "string" && value.startsWith("/") && !value.includes("://");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();

  // Read optional returnTo from the form body
  let returnTo = "/login";
  try {
    const formData = await request.formData();
    const candidate = formData.get("returnTo");
    if (typeof candidate === "string" && isSafeRelativeUrl(candidate)) {
      returnTo = candidate;
    }
  } catch {
    // formData() throws if body is not form-encoded — fall through to default
  }

  return NextResponse.redirect(new URL(returnTo, request.url));
}
```

The `isSafeRelativeUrl` guard prevents open-redirect attacks — only relative paths starting with `/` are accepted.

---

## 2 — StudentShellClient: `portalSlug` prop + `returnTo`

**File:** `components/student-shell-client.tsx`

### 2a — Add `portalSlug` to interface

```typescript
// BEFORE:
interface StudentShellClientProps {
  academyName: string;
  logoUrl: string | null;
  isVerified: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;
  children: React.ReactNode;
}

// AFTER:
interface StudentShellClientProps {
  academyName: string;
  logoUrl: string | null;
  isVerified: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;
  portalSlug?: string;
  children: React.ReactNode;
}
```

### 2b — Destructure in component

```typescript
// BEFORE:
export function StudentShellClient({
  academyName,
  logoUrl,
  isVerified,
  basePath,
  querySuffix,
  displayName,
  traderId,
  children,
}: StudentShellClientProps) {

// AFTER:
export function StudentShellClient({
  academyName,
  logoUrl,
  isVerified,
  basePath,
  querySuffix,
  displayName,
  traderId,
  portalSlug,
  children,
}: StudentShellClientProps) {
```

### 2c — Compute `returnTo` and add hidden input to sign-out form

Add this derived value after the component opens (before the JSX return):

```typescript
// Where to send the user after sign-out:
// - Custom domain (/academy): redirect to /login — middleware maps it to the domain-specific login
// - Main domain (/student): redirect to /portal/{slug} if we have one, else /login
const signOutReturnTo =
  basePath === "/academy"
    ? "/login"
    : portalSlug
      ? `/portal/${portalSlug}`
      : "/login";
```

Then update the sign-out form (currently at line 172):

```tsx
// BEFORE:
<form action="/auth/signout" method="post">
  <button className={styles.signoutBtn} type="submit">
    <LogOut size={16} />
    Sign out
  </button>
</form>

// AFTER:
<form action="/auth/signout" method="post">
  <input type="hidden" name="returnTo" value={signOutReturnTo} />
  <button className={styles.signoutBtn} type="submit">
    <LogOut size={16} />
    Sign out
  </button>
</form>
```

---

## 3 — DashboardShell: `portalSlug` prop + `returnTo`

**File:** `components/dashboard-shell.tsx`

### 3a — Add to interface

```typescript
// BEFORE:
interface DashboardShellProps {
  ...
  portalName?: string;
}

// AFTER:
interface DashboardShellProps {
  ...
  portalName?: string;
  portalSlug?: string;
}
```

### 3b — Destructure

```typescript
// BEFORE:
export function DashboardShell({
  ...
  portalName,
}: DashboardShellProps) {

// AFTER:
export function DashboardShell({
  ...
  portalName,
  portalSlug,
}: DashboardShellProps) {
```

### 3c — Compute `returnTo`

Add after the component opens:

```typescript
// Mentors return to their academy public page; admin stays on platform login
const signOutReturnTo =
  mode === "admin"
    ? "/login"
    : portalSlug
      ? `/portal/${portalSlug}`
      : "/login";
```

### 3d — Add hidden input to both sign-out forms

There are two sign-out forms in the shell (sidebar and mobile drawer). Update both:

```tsx
// BEFORE:
<form action="/auth/signout" method="post">
  <button className={styles.signout} type="submit">
    <LogOut size={17} /> Sign out
  </button>
</form>

// AFTER (both instances):
<form action="/auth/signout" method="post">
  <input type="hidden" name="returnTo" value={signOutReturnTo} />
  <button className={styles.signout} type="submit">
    <LogOut size={17} /> Sign out
  </button>
</form>
```

---

## 4 — Pass `portalSlug` from student pages

**Find all usages:**

```bash
grep -r "StudentShellClient" app/student/ --include="*.tsx" -l
```

For every file found, add `portalSlug={portal?.slug}` to the `<StudentShellClient` call. The `portal` object is already in scope on all student pages (queried from `student_applications` join with `portals(portal_name,slug,logo_path)`).

Example diff (same pattern for all student pages):

```tsx
// BEFORE:
<StudentShellClient
  academyName={academyName}
  basePath={base}
  displayName={displayName}
  isVerified={isVerified}
  logoUrl={logoUrl}
  querySuffix={suffix}
  traderId={portal?.trader_id}
>

// AFTER:
<StudentShellClient
  academyName={academyName}
  basePath={base}
  displayName={displayName}
  isVerified={isVerified}
  logoUrl={logoUrl}
  portalSlug={portal?.slug}
  querySuffix={suffix}
  traderId={portal?.trader_id}
>
```

---

## 5 — Pass `portalSlug` from mentor dashboard pages

**Find all usages:**

```bash
grep -r "DashboardShell" app/dashboard/ --include="*.tsx" -l
```

For every file found, add `portalSlug={portal.slug}` to every `<DashboardShell` call. The `portal` object is already destructured from `getMentorWorkspace()` on all mentor pages (added in EP-069).

Example diff:

```tsx
// BEFORE:
<DashboardShell
  activePath="/dashboard/bookings"
  description="..."
  portalName={portal.portal_name}
  title="Bookings"
  userLabel={displayName}
>

// AFTER:
<DashboardShell
  activePath="/dashboard/bookings"
  description="..."
  portalName={portal.portal_name}
  portalSlug={portal.slug}
  title="Bookings"
  userLabel={displayName}
>
```

`settings/page.tsx` has multiple `DashboardShell` instances (one per tab) — add `portalSlug` to all of them.

---

## 6 — Commit and deploy

No migration needed.

```bash
git add -A
git commit -m "fix: EP-070 sign-out redirects to academy public page instead of platform login"
git push origin main && vercel --prod
```

---

## 7 — Acceptance Criteria

Test with KaiTrades tenant.

- [ ] Student signs out from `/student?portal=kaitrades` → lands on `/portal/kaitrades` (not `/login`)
- [ ] Student signs out from custom domain → lands on `customdomain.com/login` (domain-specific login via middleware rewrite)
- [ ] Mentor signs out from `/dashboard` → lands on `/portal/kaitrades` (not `/login`)
- [ ] Admin signs out from `/admin` → lands on `/login` (unchanged — admin has no portal slug)
- [ ] Open-redirect guard: a crafted `returnTo=https://evil.com` in the form is ignored and falls back to `/login`
- [ ] TypeScript compiles clean
