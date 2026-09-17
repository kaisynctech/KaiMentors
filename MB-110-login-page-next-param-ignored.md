# Mission Brief MB-110
## Fix: Platform Login Page Ignores `next` URL Parameter

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — Breaks goto chain for super_admin (MB-109 Test D)  
**Prepared by:** Enterprise Architect

---

## Root Cause (Tool-Verified)

From `app/login/page.tsx` (file-read confirmed):

**Problem 1 — Already-logged-in auto-redirect ignores `next`:**
```typescript
// lines 19–23
const dest =
  profile?.role === "super_admin" ? "/admin" :
  profile?.role === "trader" ? "/dashboard" :
  profile?.role === "student" ? "/student" : null;
if (dest) redirect(dest);
```
When a logged-in `super_admin` hits `/login?next=%2Fapi%2Fworkspace%2Fgoto...`, this immediately redirects to `/admin`, discarding the `next` chain. The goto route is never reached.

**Problem 2 — `LoginForm` rendered without `next` prop:**
```typescript
// line 55
<LoginForm />
```
The `next` query parameter is never read from `searchParams` and never passed to `LoginForm`. Even if the user is not already logged in, after they sign in the form has no `next` to follow.

**Problem 3 — `LoginForm` hardcodes `super_admin` destination:**
From `components/login-form.tsx` (confirmed):
```typescript
const destination =
  profile?.role === "super_admin"
    ? "/admin"           // ← always /admin, no next override
    : profile?.role === "student"
      ? studentDestination
      : mentorDestination;
window.location.href = destination;
```

**Result:** When the goto chain from MB-109 redirects to `/login?next=...` (because there was no platform session), signing in sends the user to `/admin`. The goto route is never visited. `km_workspace` is never set. The user lands on the wrong workspace.

---

## Fix

### Change 1 — `app/login/page.tsx`

Accept `searchParams` and honor `next` in both the auto-redirect and the `LoginForm` render.

**Find:**
```typescript
export default async function LoginPage() {
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      const dest =
        profile?.role === "super_admin" ? "/admin" :
        profile?.role === "trader" ? "/dashboard" :
        profile?.role === "student" ? "/student" : null;
      if (dest) redirect(dest);
    }
  }

  return (
    <main className={styles.page}>
```

**Replace with:**
```typescript
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only honour next if it is a safe relative path (prevents open-redirect).
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      // If a safe next param is present, always follow it (e.g. goto chain from
      // custom domain login). Otherwise fall back to the role default.
      const dest =
        safeNext ??
        (profile?.role === "super_admin" ? "/admin" :
         profile?.role === "trader" ? "/dashboard" :
         profile?.role === "student" ? "/student" : null);
      if (dest) redirect(dest);
    }
  }

  return (
    <main className={styles.page}>
```

Also update the `<LoginForm />` line to pass `next`:

**Find:**
```typescript
          <LoginForm />
```

**Replace with:**
```typescript
          <LoginForm next={safeNext ?? undefined} />
```

---

### Change 2 — `components/login-form.tsx`

Add a `next` prop and use it as the post-login destination when provided.

**Find** (the props interface):
```typescript
export function LoginForm({
  studentDestination = "/student",
  mentorDestination = "/dashboard",
  allowedRole,
  academyTraderId,
  academyContext,
  submitLabel = "Sign in to workspace",
}: {
  studentDestination?: string;
  mentorDestination?: string;
  allowedRole?: "student";
  academyTraderId?: string;
  academyContext?: {
    traderId: string;
    studentDestination: string;
    mentorDestination: string;
  };
  submitLabel?: string;
} = {}) {
```

**Replace with:**
```typescript
export function LoginForm({
  studentDestination = "/student",
  mentorDestination = "/dashboard",
  next,
  allowedRole,
  academyTraderId,
  academyContext,
  submitLabel = "Sign in to workspace",
}: {
  studentDestination?: string;
  mentorDestination?: string;
  next?: string;
  allowedRole?: "student";
  academyTraderId?: string;
  academyContext?: {
    traderId: string;
    studentDestination: string;
    mentorDestination: string;
  };
  submitLabel?: string;
} = {}) {
```

**Find** (the destination logic at the bottom of the non-academyContext path):
```typescript
      const destination =
        profile?.role === "super_admin"
          ? "/admin"
          : profile?.role === "student"
            ? studentDestination
            : mentorDestination;
      window.location.href = destination;
```

**Replace with:**
```typescript
      // If an explicit next was provided (e.g. from a goto chain), follow it.
      // Otherwise fall back to role defaults.
      const destination =
        next ??
        (profile?.role === "super_admin"
          ? "/admin"
          : profile?.role === "student"
            ? studentDestination
            : mentorDestination);
      window.location.href = destination;
```

---

## What Does NOT Change

- Academy login pages (`app/portal/[slug]/login`, `app/domain-sites/[hostname]/login`) — untouched
- `academyContext` login path in `login-form.tsx` — untouched
- All middleware auth logic — untouched
- No DB changes

---

## Security Note

The `safeNext` check in `LoginPage` (`startsWith("/") && !startsWith("//")`) ensures `next` can only be a relative path on this origin. It cannot be used to redirect to an external site. The same relative-path constraint is enforced by the fact that `LoginForm` receives it only from `LoginPage` which has already sanitised it.

---

## Build and Commit

```bash
npm run build
# must be zero errors

git add app/login/page.tsx components/login-form.tsx
git commit -m "fix: honour next param in platform login page and LoginForm for goto chain"
git push origin HEAD:main
```

---

## Testing

**Test D (from MB-109) — retry from scratch:**
1. Clear all cookies for `kaimentors.vercel.app`, `www.passii714.com`, `www.md415.com`
2. Visit `https://www.passii714.com/login`, sign in
3. Browser goes to `kaimentors.vercel.app/login?next=%2Fapi%2Fworkspace%2Fgoto%3FtraderId%3D...`
4. Sign in on the platform login page
5. Must follow the `next` chain → goto route → sets `km_workspace` = PASII → `/dashboard` shows **PASII** workspace

**Regression — normal super_admin login:**
1. Clear all cookies
2. Visit `https://kaimentors.vercel.app/login` (no `next` param)
3. Sign in
4. Must go to `/admin` (unchanged default behaviour)

---

## Definition of Done

- Vercel deployment green
- Test D from MB-109 now completes: PASII custom domain login → platform login → PASII dashboard
- `kaimentors.vercel.app/login` without `next` still goes to `/admin` for super_admin (no regression)
