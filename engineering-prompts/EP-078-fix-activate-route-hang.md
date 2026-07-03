# EP-078 — Fix Activate Route Hang Blocking Portal Login

## Root Cause

The `POST /api/workspace/activate` route calls `supabase.auth.getUser()`.
In `@supabase/ssr`, the server client's `getUser()` **always makes a network
round-trip** to Supabase's auth API (`/auth/v1/user`) to verify the JWT. This is
the recommended server-side security pattern, but it adds a second Supabase
network call on top of the `signInWithPassword` call that the browser just made.

The middleware excludes `/api/` routes, so there is no prior session refresh.
The route receives the raw browser cookies and calls `getUser()` from scratch.

If Supabase's auth verification endpoint is slow (cold start, rate limit, or
transient latency), this call can take 10–30 seconds. There is no timeout on
the server-side call, and no timeout on the browser-side `fetch` either.
Result: the login page spinner runs indefinitely.

## Two-part fix

### Part 1 — `app/api/workspace/activate/route.ts`

Replace `supabase.auth.getUser()` with `supabase.auth.getSession()`.

`getSession()` reads and decodes the JWT from cookies **locally** — no network
call. It returns `session.user` (the same user object) from the JWT payload.
The subsequent `trader_members` PostgREST query still carries the user's JWT
via the Supabase client, so RLS continues to enforce authorization at the
database level. Setting a workspace cookie is a low-risk operation; the actual
dashboard data remains RLS-protected regardless of how the cookie is set.

Also add `AbortSignal.timeout(5000)` to the `trader_members` query so a slow
PostgREST call cannot hang the route indefinitely.

### Part 2 — `components/login-form.tsx`

Add `AbortSignal.timeout(5000)` to the `fetch("/api/workspace/activate", ...)`
call in `login-form.tsx`. Move the response and error handling into a wrapping
try/catch so a timeout aborts cleanly and the redirect still fires. The
workspace cookie is a best-effort enhancement — the dashboard falls back to the
user's first membership if it is not set.

---

## File changes

### `app/api/workspace/activate/route.ts`

**Full replacement:**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const traderId = typeof body?.traderId === "string" ? body.traderId : null;
  if (!traderId) {
    return NextResponse.json({ error: "traderId required." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // getSession() reads the JWT from cookies locally — no Supabase auth API
  // round-trip. The access token was just issued by signInWithPassword so it
  // is guaranteed fresh; no refresh call is needed.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const sig = AbortSignal.timeout(5000);
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", userId)
    .eq("trader_id", traderId)
    .abortSignal(sig)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
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

**Changes summary:**
- `supabase.auth.getUser()` → `supabase.auth.getSession()` (local JWT decode,
  no network call)
- `(await request.json()) as { traderId: string }` → `.catch(() => null)` guard
  so a malformed body returns 400 instead of throwing
- Add `AbortSignal.timeout(5000)` + `.abortSignal(sig)` on the `trader_members`
  query
- `const user = data.user` → `const userId = session.user.id` (same value,
  cleaner naming)

---

### `components/login-form.tsx`

Replace the `activate` fetch block (lines 76–90) only. No other changes.

**Before:**
```typescript
const activateRes = await fetch("/api/workspace/activate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ traderId: academyContext.traderId }),
});
if (!activateRes.ok) {
  // Log for debugging but do not block the redirect — the
  // workspace cookie is a best-effort enhancement.
  console.error(
    "[LoginForm] /api/workspace/activate returned",
    activateRes.status,
  );
}
window.location.href = academyContext.mentorDestination;
return;
```

**After:**
```typescript
// Best-effort: set the km_workspace cookie so the dashboard opens the right
// workspace. If the call times out or fails, the dashboard falls back to the
// user's first membership — do not block the redirect.
try {
  const activateRes = await fetch("/api/workspace/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: academyContext.traderId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!activateRes.ok) {
    console.error(
      "[LoginForm] /api/workspace/activate returned",
      activateRes.status,
    );
  }
} catch (err) {
  console.error("[LoginForm] /api/workspace/activate failed:", err);
}
window.location.href = academyContext.mentorDestination;
return;
```

**Change summary:**
- Wrap the `fetch` in a `try/catch` so an `AbortError` (from the 5 s timeout)
  or a network error does not propagate to the outer `catch` and show an
  error to the user
- Add `signal: AbortSignal.timeout(5000)` — the fetch aborts after 5 s
- Redirect fires unconditionally after the try/catch block

---

## What does NOT change

- All other route handlers — unchanged.
- The middleware — unchanged.
- `getMentorWorkspace()` — unchanged; its `memberships[0]` fallback already
  handles the case where the workspace cookie is absent.

---

## Why four workspaces do not cause this

The membership query is scoped to a single `(user_id, trader_id)` pair —
one row lookup. The number of workspaces a user belongs to is irrelevant.
The hang is caused entirely by the `getUser()` auth network call and the
absence of timeouts; both are addressed by this EP.

---

## Verification after deploy

1. Navigate to `/portal/traders-confidence/login`.
2. Enter `kaisynctech@gmail.com` + password. Click **Sign In**.
   - **Expected**: spinner appears → login completes and redirects to
     `/dashboard` within 3 seconds.
3. Open browser DevTools → Network tab. Filter for `activate`.
   - **Expected**: `POST /api/workspace/activate` returns `200 OK` in < 1 s.
4. Verify the TC workspace is active on the dashboard (TC stats visible, not
   another workspace's data).
5. Repeat with a wrong password.
   - **Expected**: spinner appears → "Incorrect email address or password."
     error shows within 3 s, form resets.
