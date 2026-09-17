# Mission Brief MB-109
## Fix: Cross-Domain Workspace Cookie — Custom Domain Login Lands in Wrong Portal

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** Critical — Tenant isolation failure on login  
**Prepared by:** Enterprise Architect

---

## Root Cause (Tool-Verified, No Guesswork)

**DB state confirmed (execute_sql):**
`kaisynctech@gmail.com` (user_id `44213ee5-da12-4d06-a7d9-1601d42e79c3`) has `trader_members` rows as `owner` in four portals, ordered by creation date:

| Portal | Slug | trader_id | Created |
|---|---|---|---|
| KaiTrades | kaitrades | `cf6c1fc0-fe69-41cd-bb38-ad06fa098dfc` | 2026-06-11 |
| Traders Confidence | traders-confidence | `c2818620-067e-4d4a-9296-41e616215b4e` | 2026-06-12 |
| Milkers FX | milkers-fx | `b0812f8d-1ab0-4409-ad58-4f0cc812ad51` | 2026-06-18 |
| PASII | pasii | `63d25433-3056-4b37-8cff-b259963856ca` | 2026-07-01 |

Both TC (`www.md415.com`) and PASII (`www.passii714.com`) have active custom domains.

---

**Code trace (five files read):**

### Step 1 — Dashboard workspace resolution (`lib/workspace.ts` lines 26–30)

```typescript
const { data: memberships } = await supabase
  .from("trader_members")
  .select(...)
  .eq("user_id", user.id)
  .order("created_at");   // ← oldest first

const cookieValue = cookieStore.get("km_workspace")?.value ?? null;
const membership =
  (cookieValue ? memberships.find((m) => m.trader_id === cookieValue) : null) ??
  memberships[0];   // ← fallback: ALWAYS KaiTrades if cookie absent/wrong
```

### Step 2 — Where `km_workspace` is set (`app/api/workspace/activate/route.ts` lines 38–45)

```typescript
const response = NextResponse.json({ ok: true });
response.cookies.set("km_workspace", traderId, {
  httpOnly: true, sameSite: "lax", path: "/",
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === "production",
});
return response;
```

Cookies are scoped to the domain that serves the response. If this route is called from `www.passii714.com`, the cookie is set on `www.passii714.com`. The dashboard at `kaimentors.vercel.app` never receives it.

### Step 3 — Where the activate call is made (`components/login-form.tsx` lines 80–85)

```typescript
const activateRes = await fetch("/api/workspace/activate", {   // ← RELATIVE URL
  method: "POST",
  body: JSON.stringify({ traderId: academyContext.traderId }),
  ...
});
window.location.href = academyContext.mentorDestination;   // → kaimentors.vercel.app/dashboard
```

The `fetch` is relative → resolves to `www.passii714.com/api/workspace/activate` → cookie set on `www.passii714.com` (useless). Then navigates cross-domain to `kaimentors.vercel.app/dashboard`.

### Step 4 — Result

Dashboard runs `getMentorWorkspace()` on `kaimentors.vercel.app`. No `km_workspace` cookie exists on that domain (or it's stale from a prior session). Falls back to `memberships[0]` = **KaiTrades** — regardless of which portal the user logged into.

---

## Why This Is a Tenant Isolation Issue

A portal owner who manages multiple academies logging in through any custom domain will always see their **oldest** workspace, not the one they authenticated against. The platform is effectively ignoring the login portal context entirely after the Supabase auth step.

---

## Fix

### Approach

When a custom domain login is complete, do not call the activate endpoint client-side (it would set the cookie on the wrong domain). Instead, redirect the browser to a new **platform-domain GET route** (`/api/workspace/goto`) that:

1. Runs on `kaimentors.vercel.app` (correct domain for the cookie)
2. Authenticates the user via the existing platform session (top-level browser navigation sends `kaimentors.vercel.app` cookies, SameSite=Lax allows cross-site GET navigation)
3. Validates membership for the requested traderId
4. Sets `km_workspace` on `kaimentors.vercel.app`
5. Redirects to `/dashboard`

The existing `/api/workspace/activate` POST route is preserved and unchanged — it continues to serve platform-native logins (same-domain, works correctly).

---

### Change 1 — New file: `app/api/workspace/goto/route.ts`

Create this file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const traderId = searchParams.get("traderId");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!traderId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    // No active platform session — send to login, preserve the goto URL as next
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Validate the user is actually a member of the requested workspace.
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!membership) {
    // Valid session but no membership for this trader — go to their default dashboard.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Set km_workspace on the platform domain and redirect to dashboard.
  const dashboardUrl = new URL(next, request.url);
  const response = NextResponse.redirect(dashboardUrl);
  response.cookies.set("km_workspace", traderId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
```

**What this does:**
- Authenticated GET endpoint (no CORS, no token in body — uses the browser's existing `kaimentors.vercel.app` session)
- Sets `km_workspace` on the correct domain (the response is from `kaimentors.vercel.app`)
- Validates membership before setting (cannot be exploited to hijack another workspace)
- Redirects to `/dashboard` (or any `next` path)
- If no platform session: sends to `/login` preserving the goto URL, so after platform login the user is routed correctly

---

### Change 2 — `components/academy-login-page.tsx` lines 22–25

**Find:**
```typescript
  const platformOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const setupHref = customDomain && platformOrigin ? new URL("/account-setup", platformOrigin).toString() : "/account-setup";
  const recoveryHref = customDomain && platformOrigin ? new URL("/recover", platformOrigin).toString() : "/recover";
  const mentorDashboardHref = customDomain && platformOrigin ? new URL("/dashboard", platformOrigin).toString() : "/dashboard";
```

**Replace with:**
```typescript
  const platformOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const setupHref = customDomain && platformOrigin ? new URL("/account-setup", platformOrigin).toString() : "/account-setup";
  const recoveryHref = customDomain && platformOrigin ? new URL("/recover", platformOrigin).toString() : "/recover";
  // For custom domain logins, route through /api/workspace/goto on the platform domain.
  // This ensures km_workspace is set on kaimentors.vercel.app (where the dashboard runs),
  // not on the custom domain where the Set-Cookie would be unreachable by the dashboard.
  const mentorDashboardHref =
    customDomain && platformOrigin
      ? new URL(
          `/api/workspace/goto?traderId=${data.portal.trader_id}&next=/dashboard`,
          platformOrigin,
        ).toString()
      : "/dashboard";
```

**What changed:** For custom domain logins, `mentorDashboardHref` now points to `/api/workspace/goto` on the platform, including the `traderId` for the portal the user is logging into. For platform portal logins (`customDomain = false`), it remains `/dashboard` — the existing activate flow is untouched.

---

### Change 3 — `components/login-form.tsx` lines 77–92

When `mentorDestination` is the goto URL (an absolute URL containing `/api/workspace/goto`), the activate call must be skipped — it would set the cookie on the custom domain, which is exactly the problem we're fixing. The goto route handles auth + cookie + redirect.

**Find:**
```typescript
        if (membership) {
          // Workspace activate is blocking — if it fails the user must not
          // proceed to the dashboard carrying a stale workspace cookie.
          const activateRes = await fetch("/api/workspace/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traderId: academyContext.traderId }),
            signal: AbortSignal.timeout(12000),
          });
          if (!activateRes.ok) {
            throw new Error(
              "Could not open this workspace. Please try again.",
            );
          }
          window.location.href = academyContext.mentorDestination;
          return;
        }
```

**Replace with:**
```typescript
        if (membership) {
          // If mentorDestination is an absolute URL (cross-domain goto route), navigate
          // directly — the goto route handles workspace cookie setting on the platform domain.
          // For same-domain destinations, call activate first to set the cookie here.
          if (academyContext.mentorDestination.startsWith("http")) {
            window.location.href = academyContext.mentorDestination;
            return;
          }
          // Same-domain (platform portal login): call activate to set km_workspace cookie.
          const activateRes = await fetch("/api/workspace/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traderId: academyContext.traderId }),
            signal: AbortSignal.timeout(12000),
          });
          if (!activateRes.ok) {
            throw new Error(
              "Could not open this workspace. Please try again.",
            );
          }
          window.location.href = academyContext.mentorDestination;
          return;
        }
```

**What changed:** Added a branch: if `mentorDestination` is an absolute URL, navigate directly (the goto route handles everything). If it's a relative path, use the existing activate-then-navigate flow.

---

## What Does NOT Change

- `/api/workspace/activate` route — unchanged, continues to serve platform-native logins
- `lib/workspace.ts` — unchanged
- `middleware.ts` — unchanged
- All student login flows — unchanged
- All other portal pages — unchanged
- Database schema — no changes

---

## Login Flow Comparison

**Before (broken):**
```
www.passii714.com/login
  → signInWithPassword() ✓
  → fetch("/api/workspace/activate")  ← sets km_workspace on www.passii714.com (useless)
  → navigate to kaimentors.vercel.app/dashboard
  → getMentorWorkspace() reads km_workspace on kaimentors.vercel.app → stale/absent
  → fallback: memberships[0] = KaiTrades ← WRONG PORTAL
```

**After (correct):**
```
www.passii714.com/login
  → signInWithPassword() ✓
  → navigate to kaimentors.vercel.app/api/workspace/goto?traderId=<PASII>&next=/dashboard
  → goto route: validates session + membership, sets km_workspace=<PASII_traderId> on kaimentors.vercel.app ✓
  → redirect to /dashboard
  → getMentorWorkspace() reads km_workspace → PASII ✓
```

---

## Build and Commit

```bash
npm run build
# must be zero errors

git add app/api/workspace/goto/route.ts \
        components/academy-login-page.tsx \
        components/login-form.tsx
git commit -m "fix: route custom domain post-login through platform goto endpoint to set workspace cookie on correct domain"
git push origin HEAD:main
```

---

## Testing

After Vercel deployment is green, using `kaisynctech@gmail.com`:

**Test A — PASII custom domain login:**
1. Clear all cookies for `www.passii714.com` and `kaimentors.vercel.app`
2. Visit `https://www.passii714.com/login`
3. Sign in with `kaisynctech@gmail.com`
4. Must land on `kaimentors.vercel.app/dashboard` showing **PASII** workspace
5. Must NOT show KaiTrades, Traders Confidence, or any other portal

**Test B — TC custom domain login:**
1. Clear all cookies
2. Visit `https://www.md415.com/login`
3. Sign in
4. Must land on dashboard showing **Traders Confidence** workspace

**Test C — Platform portal login (regression):**
1. Clear all cookies
2. Visit `https://kaimentors.vercel.app/portal/kaitrades`
3. Sign in
4. Must land on dashboard showing **KaiTrades** workspace
5. This exercises the unchanged same-domain activate path — must still work

**Test D — No prior platform session:**
1. Clear ALL cookies including `kaimentors.vercel.app`
2. Visit `https://www.passii714.com/login`, sign in
3. Browser navigates to `kaimentors.vercel.app/api/workspace/goto?traderId=<PASII>&next=/dashboard`
4. No platform session → should redirect to `/login` (platform login) with `next` preserved
5. Log in on the platform
6. Should land on PASII dashboard

---

## Definition of Done

- Vercel deployment green
- Test A, B, C pass
- Test D gracefully redirects to platform login (no hard crash or blank page)
- Portals never cross-contaminate for any login path
