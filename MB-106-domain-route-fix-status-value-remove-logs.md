# Mission Brief MB-106
## Domain Route — Fix `status` Value on INSERT + Remove Diagnostic Logs

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** Critical — Production Blocker (final fix)  
**Prepared by:** Enterprise Architect

---

## Root Cause (Tool-Verified)

From Supabase Postgres logs (`get_logs`, confirmed):

```
new row for relation "website_domains" violates check constraint "website_domains_status_check"
```

The route inserts `status: "pending_vercel_setup"`. The DB check constraint (confirmed via `pg_constraint` query) only allows:

```
'requested' | 'verification_required' | 'configuring' | 'active' | 'failed' | 'disabled'
```

`"pending_vercel_setup"` is not in that list. The correct initial value is `"requested"` (also the column default).

All other INSERT values are valid (confirmed against all seven check constraints on `website_domains`).

---

## Affected File

`app/api/website-builder\domains\route.ts` — two targeted changes.

---

## Change 1 — Fix the INSERT status value

**Find** (line ~244):

```typescript
      .insert({
        trader_id: workspace.traderId,
        portal_id: workspace.portal.id,
        hostname,
        provider: "vercel",
        status: "pending_vercel_setup",
        ownership_status: "pending",
        dns_status: "pending",
        ssl_status: "pending",
        auth_status: "configured",
      })
```

**Replace with:**

```typescript
      .insert({
        trader_id: workspace.traderId,
        portal_id: workspace.portal.id,
        hostname,
        provider: "vercel",
        status: "requested",
        ownership_status: "pending",
        dns_status: "pending",
        ssl_status: "pending",
        auth_status: "configured",
      })
```

**What changed:** `status: "pending_vercel_setup"` → `status: "requested"`.

---

## Change 2 — Fix the writeEvent nextStatus for accuracy

**Find** (line ~274):

```typescript
    await writeEvent(admin, {
      domainId: domain.id,
      traderId: workspace.traderId,
      portalId: workspace.portal.id,
      actorUserId: workspace.user.id,
      eventType: "domain_registered",
      hostname,
      nextStatus: "pending_vercel_setup",
    });
```

**Replace with:**

```typescript
    await writeEvent(admin, {
      domainId: domain.id,
      traderId: workspace.traderId,
      portalId: workspace.portal.id,
      actorUserId: workspace.user.id,
      eventType: "domain_registered",
      hostname,
      nextStatus: "requested",
    });
```

**What changed:** `nextStatus: "pending_vercel_setup"` → `nextStatus: "requested"`. (The event log has no check constraint — this is for accuracy only.)

---

## Change 3 — Remove MB-104 diagnostic logs

The `t0` timer and all `log(...)` calls were added in MB-104 as temporary diagnostics. They have served their purpose. Remove them now.

**Find and delete** the following block at the top of the POST function (lines ~130–133):

```typescript
  const t0 = Date.now();
  const log = (step: string, data?: unknown) =>
    console.log(`[domains] ${step} +${Date.now() - t0}ms`, data ?? "");

  log("start");
```

**Then find and delete each of these log call lines** throughout the function (they appear as single standalone lines, easy to locate by searching for `log(`):

```typescript
  log("admin-client", { present: !!admin });
  log("before-create-client");
  log("after-create-client", { present: !!supabase });
  log("before-get-session");
  log("after-get-session", { hasUser: !!session?.user });
  log("before-profile");
  log("after-profile", { role: profile?.role });
  log("auth-rejected", { hasUser: !!user, role: profile?.role });
  log("auth-passed");
  log("before-parse");
  log("after-parse", { ok: parsed.success });
  log("before-provider");
  log("after-provider", { ok: true });
  log("provider-error", { message: error instanceof Error ? error.message : String(error) });
  log("before-portals", { action: input.action });
  log("after-portals", { found: !!resolvedPortal });
  log("before-insert");
  log("after-insert", { ok: !reserveError, id: created?.id });
```

Delete each of these lines. Do not delete the lines around them — only the `log(...)` calls themselves and the `t0`/`log` declarations at the top.

---

## What Does NOT Change

- All route logic — no changes beyond status value and log removal
- Database schema — no changes
- Other route actions (refresh, set_primary, remove) — untouched
- `lib/domains/hostnames.ts` — no changes
- `vercel.json`, `next.config.ts` — no changes

---

## Build and Commit

```bash
npm run build
# must be zero errors

git add app/api/website-builder/domains/route.ts
git commit -m "fix: use status 'requested' on domain INSERT; remove MB-104 diagnostic logs"
git push origin HEAD:main
```

---

## Testing (Architect confirms via execute_sql)

After Vercel deployment goes green:

1. Go to `kaimentors.vercel.app/admin/domains` → PASII tab
2. Click **Connect domain** for `www.passii714.com`
3. Response must arrive in under 5 seconds with no error
4. Architect confirms via:

```sql
SELECT id, hostname, status, portal_id, created_at
FROM website_domains
WHERE portal_id = 'eb7f5b51-037a-446d-bfe9-3ea3481099e2';
```

Row must exist with `status = 'requested'`.

5. After DB confirm: add `www.passii714.com` to Vercel project domains (Settings → Domains → Add Existing) as described in MB-101.

---

## Definition of Done

- Vercel deployment green
- Connect domain succeeds in under 5 seconds
- DB row confirmed by Architect via `execute_sql`
- No errors in Vercel function logs
