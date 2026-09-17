# Mission Brief MB-112
## Serve Mentor Dashboard on Client's Custom Domain

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — White-label completeness; mentors must never see kaimentors.vercel.app  
**Prepared by:** Enterprise Architect

---

## Background

After MB-111, all KaiMentors branding is removed from student- and mentor-facing pages. One structural exposure remains: the mentor dashboard lives at `kaimentors.vercel.app/dashboard`. A mentor of PASII who logs in through `www.passii714.com` is immediately redirected to the platform domain — the domain name itself is the brand leak.

**Target state:** `www.passii714.com/dashboard` serves the mentor dashboard. The custom domain never redirects to `kaimentors.vercel.app` for any mentor-facing page. Each custom domain deterministically resolves its own workspace — the `km_workspace` cookie is irrelevant for custom domain sessions.

---

## Root Cause Analysis

**Why the dashboard currently redirects (tool-verified, `middleware.ts` lines 45–60):**

```typescript
if (
  customDomain &&
  (path.startsWith("/dashboard") ||   // ← this line
    path.startsWith("/admin") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/account-setup") ||
    path.startsWith("/recover"))
) {
  return NextResponse.redirect(new URL(path, platformUrl));
}
```

**Why removing the redirect alone is not enough:**

`makeResponse()` (line 71–76) rewrites every custom domain request through `customDomainDestination()`, which maps `/dashboard` → `/domain-sites/www.passii714.com/dashboard`. That route does not exist → 404.

**Why `getMentorWorkspace()` would return the wrong workspace:**

`getMentorWorkspace()` resolves the workspace via the `km_workspace` cookie. That cookie is set on `kaimentors.vercel.app`. On `www.passii714.com`, no cookie exists → falls back to `memberships[0]` = KaiTrades (oldest). Wrong portal.

**Why the post-signout redirect breaks:**

`DashboardShell` sets `signOutReturnTo = "/portal/pasii/login"` for mentor mode. After signout on `www.passii714.com`, the browser follows that path on the custom domain → middleware rewrites to `domain-sites/www.passii714.com/portal/pasii/login` → does not exist → 404.

---

## Changes

Six file changes. Apply in order shown.

---

### Change 1 — `middleware.ts`

Two edits to the same file.

**Edit 1a — Remove `/dashboard` from the custom domain redirect block.**

**Find (lines 45–60):**
```typescript
  if (
    customDomain &&
    (path.startsWith("/dashboard") ||
      path.startsWith("/admin") ||
      path.startsWith("/onboarding") ||
      path.startsWith("/account-setup") ||
      path.startsWith("/recover"))
  ) {
    const platformUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (platformUrl) {
      return NextResponse.redirect(new URL(path, platformUrl));
    }
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    return NextResponse.redirect(destination);
  }
```

**Replace with:**
```typescript
  if (
    customDomain &&
    (path.startsWith("/admin") ||
      path.startsWith("/onboarding") ||
      path.startsWith("/account-setup") ||
      path.startsWith("/recover"))
  ) {
    const platformUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (platformUrl) {
      return NextResponse.redirect(new URL(path, platformUrl));
    }
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    return NextResponse.redirect(destination);
  }
```

`/admin`, `/onboarding`, `/account-setup`, and `/recover` continue to redirect to the platform. `/dashboard` no longer redirects — it is now served natively on the custom domain.

---

**Edit 1b — Stop rewriting `/dashboard` paths through `domain-sites/`.**

`makeResponse()` rewrites all custom domain paths through `customDomainDestination()`. Without this fix, `www.passii714.com/dashboard` would rewrite to `/domain-sites/www.passii714.com/dashboard` (non-existent route) and 404.

**Find (lines 71–76):**
```typescript
  const makeResponse = () =>
    customDomain
      ? NextResponse.rewrite(customDomainDestination(request, hostname), {
          request,
        })
      : NextResponse.next({ request });
```

**Replace with:**
```typescript
  const makeResponse = () => {
    if (customDomain && path.startsWith("/dashboard")) {
      // Dashboard is served natively on custom domains — no domain-sites rewrite.
      return NextResponse.next({ request });
    }
    return customDomain
      ? NextResponse.rewrite(customDomainDestination(request, hostname), {
          request,
        })
      : NextResponse.next({ request });
  };
```

---

### Change 2 — `lib/workspace.ts`

Add domain-based workspace resolution. When `getMentorWorkspace()` is called from a custom domain, it now resolves the workspace from the hostname via `website_domains` instead of the `km_workspace` cookie.

**Replace the entire file with:**

```typescript
import "server-only";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  // getSession() decodes the JWT from cookies locally — no network call.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user as User;

  // Determine whether this request originates from a custom domain or the platform.
  const headersList = await headers();
  const hostname = normalizeRequestHostname(
    headersList.get("x-forwarded-host") ??
      headersList.get("host") ??
      "",
  );
  const isCustomDomain = hostname !== "" && !isPlatformHostname(hostname);

  if (isCustomDomain) {
    // Custom domain: the workspace is determined solely by which domain is hosting
    // this request. The km_workspace cookie is not present on this domain — ignore it.
    const { data: domainRow } = await supabase
      .from("website_domains")
      .select("trader_id")
      .eq("hostname", hostname)
      .eq("status", "active")
      .maybeSingle();

    if (!domainRow?.trader_id) return null;

    const { data: memberRow } = await supabase
      .from("trader_members")
      .select("trader_id, role, trader:traders(display_name, timezone)")
      .eq("user_id", user.id)
      .eq("trader_id", domainRow.trader_id)
      .maybeSingle();

    if (!memberRow) return null;

    const { data: portal } = await supabase
      .from("portals")
      .select("id,trader_id,slug,portal_name,is_published,custom_domain")
      .eq("trader_id", domainRow.trader_id)
      .maybeSingle();
    if (!portal) return null;

    const trader = Array.isArray(memberRow.trader)
      ? memberRow.trader[0]
      : (memberRow.trader as { display_name: string; timezone?: string } | null);

    return {
      supabase,
      user,
      membership: memberRow,
      portal,
      traderId: memberRow.trader_id,
      role: memberRow.role as "owner" | "mentor",
      displayName: trader?.display_name ?? "Mentor workspace",
      timezone: trader?.timezone ?? "UTC",
      customDomain: true as const,
    };
  }

  // Platform domain: resolve workspace from km_workspace cookie, falling back to
  // the oldest membership.
  const { data: memberships } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name, timezone)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get("km_workspace")?.value ?? null;
  const membership =
    (cookieValue ? memberships.find((m) => m.trader_id === cookieValue) : null) ??
    memberships[0];

  const { data: portal } = await supabase
    .from("portals")
    .select("id,trader_id,slug,portal_name,is_published,custom_domain")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) return null;

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : (membership.trader as { display_name: string; timezone?: string } | null);

  return {
    supabase,
    user,
    membership,
    portal,
    traderId: membership.trader_id,
    role: membership.role as "owner" | "mentor",
    displayName: trader?.display_name ?? "Mentor workspace",
    timezone: trader?.timezone ?? "UTC",
    customDomain: false as const,
  };
}
```

**What changed:**
- Imports `headers` from `next/headers` and `isPlatformHostname`, `normalizeRequestHostname` from `lib/domains/hostnames`
- Reads hostname from `x-forwarded-host` / `host` headers (same source as middleware)
- If custom domain: looks up `website_domains` by hostname → validates user membership → returns workspace for that portal
- If platform domain: existing cookie-based logic, unchanged
- Both paths now include `customDomain: boolean` in the return value (used by Change 3 and Change 6)

---

### Change 3 — `components/academy-login-page.tsx`

Custom domain logins now navigate to `/dashboard` on the same domain. The goto chain (MB-109) is no longer needed for custom domains — workspace resolution happens server-side via hostname.

**Find (lines 25–34):**
```typescript
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

**Replace with:**
```typescript
  // Mentor dashboard is served on the same domain as the login page (custom domain
  // or platform). Workspace is resolved server-side from the hostname (custom domain)
  // or km_workspace cookie (platform) — no cross-domain goto chain needed.
  const mentorDashboardHref = "/dashboard";
```

Also update the `LoginForm` call to pass `customDomain` into `academyContext`:

**Find:**
```typescript
            <LoginForm
              academyContext={{
                traderId: data.portal.trader_id,
                studentDestination,
                mentorDestination: mentorDashboardHref,
              }}
              submitLabel="Sign In"
            />
```

**Replace with:**
```typescript
            <LoginForm
              academyContext={{
                traderId: data.portal.trader_id,
                studentDestination,
                mentorDestination: mentorDashboardHref,
                customDomain,
              }}
              submitLabel="Sign In"
            />
```

---

### Change 4 — `components/login-form.tsx`

Add `customDomain` to the `academyContext` type. When `customDomain` is true, skip the activate call — workspace is resolved from hostname on the server, not from the `km_workspace` cookie.

**Edit 4a — Add `customDomain` to the `academyContext` type.**

**Find:**
```typescript
  academyContext?: {
    traderId: string;
    studentDestination: string;
    mentorDestination: string;
  };
```

**Replace with:**
```typescript
  academyContext?: {
    traderId: string;
    studentDestination: string;
    mentorDestination: string;
    customDomain?: boolean;
  };
```

---

**Edit 4b — Update the mentor membership block.**

**Find (lines 79–100):**
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

**Replace with:**
```typescript
        if (membership) {
          if (academyContext.customDomain) {
            // Custom domain login: workspace is resolved server-side from the hostname.
            // The km_workspace cookie is not used on custom domains — no activate needed.
            window.location.href = academyContext.mentorDestination;
            return;
          }
          // Platform portal login: call activate to set the km_workspace cookie on the
          // platform domain, then navigate.
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

---

### Change 5 — `app/dashboard/layout.tsx` (NEW FILE)

The root `app/layout.tsx` has `template: "%s | KaiMentors"`. Without this override, every browser tab for `www.passii714.com/dashboard` reads "Page | KaiMentors".

**Create `app/dashboard/layout.tsx`:**

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s",   // no "| KaiMentors" suffix — dashboard is white-labelled
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

This is a minimal pass-through layout. No DOM changes, no style changes. It only overrides the metadata title template inherited from the root layout.

---

### Change 6 — `app/auth/signout/route.ts`

`DashboardShell` sets `signOutReturnTo = "/portal/pasii/login"` for mentor mode. On `www.passii714.com`, that path does not exist and would 404 after signout.

When the signout POST originates from a custom domain, override `returnTo` to `"/login"`. On the custom domain, `/login` is rewritten by middleware to the portal's login page.

**Find:**
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
```

**Replace with:**
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
```

---

**Find (lines 19–28):**
```typescript
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
```

**Replace with:**
```typescript
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

  // When signing out from a custom domain, /portal/[slug]/login does not exist on
  // that domain. Override returnTo to /login, which middleware rewrites to the
  // portal's own login page.
  try {
    const requestHostname = normalizeRequestHostname(
      new URL(request.url).hostname,
    );
    if (!isPlatformHostname(requestHostname)) {
      returnTo = "/login";
    }
  } catch {
    // leave returnTo as-is
  }
```

---

## What Does NOT Change

- `/api/workspace/goto` route — preserved. Still used by platform-domain logins that need to switch workspace via cookie. It is no longer in the custom domain login path.
- `/api/workspace/activate` route — preserved. Still used by platform portal logins (`kaimentors.vercel.app/portal/[slug]/login`).
- All student pages and routes — unchanged.
- All 35+ dashboard page.tsx and API route files — no changes required. `getMentorWorkspace()` propagates the new resolution logic automatically.
- `DashboardShell` — no changes required (signout fix is in the route, not the component).
- Database schema — no changes.

---

## Login Flow After MB-112

**Custom domain login (e.g. `www.passii714.com/login`):**
```
User signs in
  → mentor membership confirmed
  → academyContext.customDomain = true → skip activate
  → window.location.href = "/dashboard"
  → browser navigates to www.passii714.com/dashboard
  → middleware: not in redirect list, makeResponse() → NextResponse.next()
  → auth guard: user authenticated, role = trader → passes
  → getMentorWorkspace(): hostname = www.passii714.com → isPlatformHostname = false
  → query website_domains WHERE hostname = 'www.passii714.com' → trader_id = PASII
  → validate user membership → return PASII workspace ✓
```

**Platform portal login (unchanged, `kaimentors.vercel.app/portal/pasii/login`):**
```
User signs in
  → mentor membership confirmed
  → academyContext.customDomain = false → call activate (sets km_workspace cookie)
  → window.location.href = "/dashboard"
  → getMentorWorkspace(): isPlatformHostname = true → reads km_workspace cookie → PASII ✓
```

**Custom domain signout (`www.passii714.com/dashboard` → sign out):**
```
POST www.passii714.com/auth/signout, returnTo = /portal/pasii/login
  → supabase.auth.signOut()
  → hostname check: www.passii714.com → not platform → override returnTo = /login
  → redirect to www.passii714.com/login
  → middleware rewrites /login → domain-sites/www.passii714.com/login → PASII login page ✓
```

---

## Build and Commit

```bash
npm run build
# must be zero errors

git add middleware.ts \
        lib/workspace.ts \
        components/academy-login-page.tsx \
        components/login-form.tsx \
        app/dashboard/layout.tsx \
        app/auth/signout/route.ts

git commit -m "feat: serve mentor dashboard on custom domain (hostname-based workspace resolution)"
git push origin HEAD:main
```

---

## Testing

Use `kaisynctech@gmail.com` throughout. Clear all cookies before each test unless noted otherwise.

**Test A — Custom domain login → custom domain dashboard:**
1. Clear all cookies for `www.passii714.com` and `kaimentors.vercel.app`
2. Visit `https://www.passii714.com/login`
3. Sign in
4. Must land on `https://www.passii714.com/dashboard` — not `kaimentors.vercel.app`
5. Dashboard must show **PASII** workspace (portal name, courses, students for PASII)

**Test B — TC custom domain login (isolation check):**
1. Clear all cookies
2. Visit `https://www.md415.com/login`
3. Sign in
4. Must land on `www.md415.com/dashboard` showing **Traders Confidence** workspace
5. Must NOT show PASII, KaiTrades, or any other portal

**Test C — Custom domain signout:**
1. From Test A or B (logged in on custom domain dashboard)
2. Click Sign Out
3. Must redirect to the custom domain login page (`www.passii714.com/login`)
4. Must NOT redirect to `kaimentors.vercel.app`

**Test D — Platform portal login (regression):**
1. Clear all cookies
2. Visit `https://kaimentors.vercel.app/portal/kaitrades`
3. Sign in
4. Must land on `kaimentors.vercel.app/dashboard` showing **KaiTrades** workspace
5. This confirms the platform cookie-based path is unaffected

**Test E — Browser tab title on custom domain dashboard:**
1. Navigate to `https://www.passii714.com/dashboard`
2. Browser tab must NOT contain "KaiMentors"
3. Must show "Dashboard" or the page-specific title

**Test F — Unauthenticated access to custom domain dashboard:**
1. Clear all cookies
2. Visit `https://www.passii714.com/dashboard` directly (no prior login)
3. Must redirect to `https://www.passii714.com/login` (portal login page)
4. Must NOT redirect to `kaimentors.vercel.app`

**Test G — Platform admin dashboard (regression):**
1. Log in at `kaimentors.vercel.app/login` as super_admin
2. Visit `kaimentors.vercel.app/dashboard`
3. Must work as before (no regression on platform-side dashboard)

---

## Definition of Done

- Vercel deployment green, zero build errors
- Tests A–G pass
- `www.passii714.com/dashboard` serves the PASII mentor dashboard
- `kaimentors.vercel.app` is never visited during a custom domain login or signout flow
- `kaimentors.vercel.app/dashboard` and platform portal logins continue to work (no regression)
