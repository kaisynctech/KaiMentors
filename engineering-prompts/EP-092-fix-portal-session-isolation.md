# EP-092 — Fix Portal Session Isolation

## Problems being fixed

### Problem 1 — Wrong workspace after login (strict isolation failure)
Logging in via the KaiTrades or Milkers FX portal login still lands on Traders
Confidence. Root cause: the `/api/workspace/activate` call in `login-form.tsx`
is wrapped in a silent try/catch. When Supabase is slow, the call times out,
the error is swallowed, and the user is redirected to the dashboard regardless
— carrying the stale `km_workspace` cookie from their previous session.

**Rule:** logging in via a portal MUST land in that portal's workspace. If the
session cannot be set, show an error and stop. Never silently proceed to the
wrong workspace.

### Problem 2 — Sign-out hangs ("just loads")
`app/auth/signout/route.ts` calls `await supabase.auth.signOut()` with no
timeout. Under Supabase infrastructure load, this call can hang indefinitely,
leaving the user stuck on the sign-out screen.

### Problem 3 — Sign-out lands on student landing page, not mentor login
After sign-out, the dashboard sends `returnTo = /portal/${portalSlug}`, which
is the student-facing academy landing page. A mentor signing out should be
returned to the mentor login page: `/portal/${portalSlug}/login`.

### Problem 4 — `getMentorWorkspace()` calls `getUser()`
`lib/workspace.ts` calls `supabase.auth.getUser()` — a network round-trip to
Supabase auth API on every dashboard page load. Under load this adds 2–183 s.
It should use `getSession()` (local JWT decode, no network).

---

## Fix 1 — `lib/workspace.ts`

**Full replacement:**

```typescript
import "server-only";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  // getSession() decodes the JWT from cookies locally — no network call.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user as User;

  const { data: memberships } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name, timezone)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) return null;

  // Resolve active workspace from cookie, falling back to earliest membership.
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
  };
}
```

The only change from the current file: `supabase.auth.getUser()` → `supabase.auth.getSession()`, with the user extracted from `session.user`.

---

## Fix 2 — `components/login-form.tsx`

The activate call must be **blocking**. If it fails the user must see an error
and stay on the login page — never be silently forwarded to the wrong workspace.

**Replace** the entire `if (membership)` block (currently lines 75–97):

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

**What changed:**
- Removed the inner `try/catch` that was silently swallowing activate errors
- Errors now propagate to the outer `catch (err)` which sets `setError(message)`
  and keeps the user on the login page
- Timeout increased from 5 000 ms to 12 000 ms (consistent with other workspace
  route timeouts throughout the codebase)

The outer catch in `signIn` already handles this pattern correctly:
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : "Sign in failed.";
  setError(...);
}
```

No other changes to `login-form.tsx`.

---

## Fix 3 — `app/auth/signout/route.ts`

**Full replacement:**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isSafeRelativeUrl(value: string): boolean {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.includes("://")
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Time-box signOut to 4 s. Under Supabase infrastructure load the call can
  // hang indefinitely — the redirect must happen regardless.
  if (supabase) {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  }

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

  const response = NextResponse.redirect(new URL(returnTo, request.url));

  // Always clear the workspace cookie on sign-out so the next login resolves
  // the workspace fresh. Without this a 30-day stale cookie persists and
  // routes the user to the wrong portal after re-login.
  response.cookies.delete("km_workspace");

  return response;
}
```

**What changed from current file:**
1. `await supabase.auth.signOut()` wrapped in `Promise.race` with 4 s timeout
2. `response.cookies.delete("km_workspace")` added before return

---

## Fix 4 — `components/dashboard-shell.tsx`

The sign-out return URL should go to the **mentor login page**, not the student
landing page.

**Replace** (line ~79–84):

```typescript
  const signOutReturnTo =
    mode === "admin"
      ? "/login"
      : portalSlug
        ? `/portal/${portalSlug}`
        : "/login";
```

**With:**

```typescript
  const signOutReturnTo =
    mode === "admin"
      ? "/login"
      : portalSlug
        ? `/portal/${portalSlug}/login`
        : "/login";
```

The only change: `/portal/${portalSlug}` → `/portal/${portalSlug}/login`.

---

## Deployment

All four files can be deployed in a single commit. No migration required.

---

## Verification (KaiTrades acceptance tenant only)

**Workspace isolation:**
1. Sign in at `kaimentors.vercel.app/portal/kaitrades/login` as
   `kaisynctech@gmail.com`. Confirm dashboard shows KaiTrades.
2. Sign out. Confirm you land on `kaimentors.vercel.app/portal/kaitrades/login`
   (not a student landing page, not Traders Confidence).
3. Sign in at `kaimentors.vercel.app/portal/traders-confidence/login` as the
   TC owner. Confirm dashboard shows Traders Confidence — not KaiTrades.
4. Sign out. Confirm you land on
   `kaimentors.vercel.app/portal/traders-confidence/login`.

**Sign-out does not hang:**
5. Measure sign-out duration — should complete within 5 s even if Supabase is
   slow (4 s timeout fires, redirect happens).

**Failed activate shows error (not wrong workspace):**
6. With DevTools network throttling set to Slow 3G, attempt portal login.
   The activate call should time out after 12 s and show
   "Could not open this workspace. Please try again." — not land silently on
   the wrong workspace.

**Do not use Traders Confidence or Milkers FX as acceptance-test fixtures.**
Use KaiTrades only. Clean up any test data added during verification.
