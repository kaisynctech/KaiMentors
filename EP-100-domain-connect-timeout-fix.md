# EP-100 — Domain Connect: Fix Session Refresh Hang & All Timeouts

**Status:** Applied  
**Date:** 2026-07-04  
**Affects:** `app/api/website-builder/domains/route.ts`, `lib/domains/provider.ts`, `components/website-domain-manager.tsx`

---

## Root Cause (Evidence-Based)

Supabase Auth logs confirmed `POST /token` (session refresh) from the super-admin's browser takes **23.5 s** and **25.5 s**. Multiple `GET /user` calls from Vercel server IPs also showed **10–15 s** durations.

`supabase.auth.getSession()` at `route.ts` line 132 silently triggers a token refresh (`POST /auth/v1/token`) whenever the super-admin's access token has expired. That refresh call has **no timeout**. Vercel's serverless function execution limit kills the function mid-flight and returns a plain-text HTML error page. The client at `domainAction` calls `response.json()` on that HTML → `SyntaxError: Unexpected token 'A'`.

EP-099's `try/catch` is inside the `POST` function body. A Vercel infrastructure kill bypasses it entirely — the process is terminated, not thrown.

**Why no Supabase REST traffic:** The route never reaches the `profiles.select("role")` query (line 141) because it hangs on the prior `getSession()` refresh call, which goes to the Auth service (`/token`), not PostgREST.

---

## Changes Applied

### 1. `app/api/website-builder/domains/route.ts` — Lines 132–141

**Before:**
```typescript
const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
const user = session?.user ?? null;
const { data: profile } = user && supabase ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
```

**After:**
```typescript
const { data: { session } } = supabase
  ? await Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 5000),
      ),
    ])
  : { data: { session: null } };
const user = session?.user ?? null;
const { data: profile } = user && supabase ? await supabase.from("profiles").select("role").eq("id", user.id).abortSignal(AbortSignal.timeout(8000)).maybeSingle() : { data: null };
```

**Effect:** If `getSession()` triggers a token refresh and that refresh hangs, the function times out at 5 seconds and returns `{ data: { session: null } }` → route returns HTTP 403 in under 5 seconds instead of hanging until Vercel kills it. The super-admin sees "Super admin access is required" and can refresh their browser to renew the session. The `profiles` query is now capped at 8 seconds.

### 2. `lib/domains/provider.ts` — `request()` method

**Before:**
```typescript
      cache: "no-store",
    });
```

**After:**
```typescript
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
```

**Effect:** All Vercel API calls (`add`, `inspect`, `verify`, `remove`) are capped at 15 seconds. Previously had no timeout and could hang indefinitely.

### 3. `components/website-domain-manager.tsx` — `domainAction`

**Before:**
```typescript
const response = await fetch("/api/website-builder/domains", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body.action === "add" ? { ...body, portalId } : body),
});
const payload = await response.json();
if (!response.ok) throw new Error(payload.error ?? "Domain action failed.");
```

**After:**
```typescript
const response = await fetch("/api/website-builder/domains", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body.action === "add" ? { ...body, portalId } : body),
  signal: AbortSignal.timeout(30000),
});
const text = await response.text();
let payload: Record<string, unknown> = {};
try {
  payload = JSON.parse(text);
} catch {
  throw new Error(`Server error (${response.status}). Please try again or refresh the page.`);
}
if (!response.ok) throw new Error(String(payload.error ?? "Domain action failed."));
```

**Effect:** Client fetch times out at 30 seconds (prevents indefinite spinner). If server returns HTML for any reason, the user sees a readable message instead of `SyntaxError: Unexpected token 'A'`.

---

## Deployment

Commit all three files and push. Vercel will deploy automatically.

After deploy, if clicking "Connect domain" returns "Super admin access is required", the super-admin's session has expired. **Refresh the page** (this renews the session via the middleware) and try again.

---

## Post-Deploy Verification

Using KaiTrades tenant only:

1. Navigate to Admin → Domains → PASII
2. Enter `www.passii714.com` and click Connect domain
3. Confirm the button shows spinner briefly (< 5 seconds if session is expired, < 30 seconds if valid)
4. Confirm `website_domains` table gains a row: `execute_sql SELECT * FROM website_domains WHERE portal_id = 'eb7f5b51-037a-446d-bfe9-3ea3481099e2'`
5. If session expired error → refresh page → retry

---

## Pending After Verification

- Remove EP-099 diagnostic `try/catch` wrapper (replace with clean final structure)
- Verify `kaisyncworkflow.com` in Resend dashboard for email delivery
- Student verification flow end-to-end test
- EP-092 acceptance-test run (KaiTrades tenant)
