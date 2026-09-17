# Mission Brief MB-104
## Domain Route — Add Diagnostic Logging to Pinpoint Server-Side Hang

**Status:** Approved for Engineering  
**Date:** 2026-07-05  
**Priority:** Critical — Diagnostic only, no logic changes  
**Prepared by:** Enterprise Architect

---

## What We Know (Evidence, Not Guesswork)

From browser DevTools Network tab (confirmed by screenshot):
- Request: `POST /api/website-builder/domains`
- Status: **(canceled)** — browser sent the request, server never responded
- Size: **0.0 kB** — server sent zero bytes
- Time: **29.99 s** — browser's `AbortSignal.timeout(30000)` cancelled it

From Supabase API logs (confirmed by `get_logs`):
- **Zero Supabase calls** appear from the route handler during any domain connect attempt
- Page loads work correctly (profiles, portals, domains all 200)
- The hang occurs before the route handler makes any network call

From `website_domains` table: still 0 rows — INSERT never reached.

**Conclusion:** The Vercel function is running (connection established, 30s wait) but is silently hanging without making any outbound network calls or returning any response.

---

## What This Brief Does

Adds `console.log` timestamps at each step of the `POST` handler. Engineer deploys. User checks **Vercel dashboard → Deployments → latest → Functions → route logs**. The last log line before silence is the hang point.

**No logic changes.** No schema changes. Diagnostic only.

---

## Affected File

`app/api/website-builder/domains/route.ts` — add logging statements only.

---

## Implementation

Add a single logger constant at the top of the POST function, then add one log call after each await/operation. The logger writes to `console.log` which appears in Vercel function logs.

### Change — Add logging throughout POST handler

**Find the start of the POST function (currently line 129):**

```typescript
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
```

**Replace with:**

```typescript
export async function POST(request: Request) {
  const t0 = Date.now();
  const log = (step: string, data?: unknown) =>
    console.log(`[domains] ${step} +${Date.now() - t0}ms`, data ?? "");

  log("start");

  const admin = createAdminClient();
  log("admin-client", { present: !!admin });
  if (!admin) {
```

---

**Find the `createClient` + `getSession` block (currently ~line 134):**

```typescript
  const supabase = await createClient();
  const { data: { session } } = supabase
    ? await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 5000),
        ),
      ])
    : { data: { session: null } };
  const user = session?.user ?? null;
  const { data: profile } = user
    ? await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  if (!user || profile?.role !== "super_admin") {
    return NextResponse.json(
      { error: "Super admin access is required." },
      { status: 403 },
    );
  }
```

**Replace with:**

```typescript
  log("before-create-client");
  const supabase = await createClient();
  log("after-create-client", { present: !!supabase });

  log("before-get-session");
  const { data: { session } } = supabase
    ? await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 5000),
        ),
      ])
    : { data: { session: null } };
  log("after-get-session", { hasUser: !!session?.user });

  const user = session?.user ?? null;

  log("before-profile");
  const { data: profile } = user
    ? await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  log("after-profile", { role: profile?.role });

  if (!user || profile?.role !== "super_admin") {
    log("auth-rejected", { hasUser: !!user, role: profile?.role });
    return NextResponse.json(
      { error: "Super admin access is required." },
      { status: 403 },
    );
  }
  log("auth-passed");
```

---

**Find `request.json()` parse (currently ~line 149):**

```typescript
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
```

**Replace with:**

```typescript
  log("before-parse");
  const parsed = requestSchema.safeParse(await request.json());
  log("after-parse", { ok: parsed.success });
  if (!parsed.success) {
```

---

**Find `createDomainProvider()` (currently ~line 165):**

```typescript
  let provider;
  try {
    provider = createDomainProvider();
  } catch (error) {
```

**Replace with:**

```typescript
  log("before-provider");
  let provider;
  try {
    provider = createDomainProvider();
    log("after-provider", { ok: true });
  } catch (error) {
    log("provider-error", { message: error instanceof Error ? error.message : String(error) });
```

---

**Find the portals lookup (currently ~line 181):**

```typescript
  const input = parsed.data;
  const { data: resolvedPortal } = input.action === "add"
    ? await admin.from("portals").select("id,trader_id").eq("id", input.portalId).maybeSingle()
    : { data: null };
```

**Replace with:**

```typescript
  const input = parsed.data;
  log("before-portals", { action: input.action });
  const { data: resolvedPortal } = input.action === "add"
    ? await admin.from("portals").select("id,trader_id").eq("id", input.portalId).maybeSingle()
    : { data: null };
  log("after-portals", { found: !!resolvedPortal });
```

---

**Find the INSERT into `website_domains` (the `add` action block, look for `.insert({`):**

Add a log just before the insert:

```typescript
  log("before-insert");
  const { data: created, error: reserveError } = await admin
    .from("website_domains")
    .insert({
```

Add a log just after the insert (after the `.single()` line):

```typescript
  log("after-insert", { ok: !reserveError, id: created?.id });
```

---

## Testing Procedure

1. Engineer applies changes, runs `npm run build` (zero errors), commits, pushes
2. Wait for Vercel deployment (green)
3. **User**: Go to Vercel dashboard → project `kaimentors` → Deployments → click the latest deployment → click **Functions** tab → find `/api/website-builder/domains` → click it → open **Logs**
4. Click **Connect domain** on the PASII tab
5. Wait 30 seconds for "signal timed out"
6. Return to Vercel function logs and read the output

## What to Report Back

Paste the log lines here. Example of what they will look like:

```
[domains] start +0ms
[domains] admin-client +1ms { present: true }
[domains] before-create-client +1ms
[domains] after-create-client +45ms { present: true }
[domains] before-get-session +45ms
```

The **last line** before the logs stop is the step that hangs. Report that step — it tells us exactly what to fix in MB-105.

---

## What Does NOT Change

- No logic changes — all code paths remain identical
- No schema changes
- No env var changes
- Logs are removed in MB-105 once the hang point is confirmed

## Definition of Done

Engineer committed and pushed. Vercel deployment green. Architect reads function log output from user.
