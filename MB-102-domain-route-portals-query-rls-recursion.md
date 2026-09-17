# Mission Brief MB-102
## Domain Route — Replace User-Role Client with Admin Client for Portals Lookup

**Status:** Approved for Engineering  
**Date:** 2026-07-05  
**Priority:** Critical — Production Blocker (same symptom as MB-101)  
**Prepared by:** Enterprise Architect

---

## Business Objective

The "signal timed out" error on domain connect has persisted after MB-101 was deployed. The INSERT never reaches the database. This brief identifies and fixes the true root cause.

---

## Root Cause (Proven by Evidence)

The route handler queries the `portals` table using the **user-role Supabase client** (`supabase`). This triggers Row Level Security evaluation. The portals RLS policies call `is_super_admin()`, which calls `current_app_role()`, which queries the `profiles` table. The profiles RLS policies also call `is_super_admin()`. This creates a **recursive evaluation chain** that PostgreSQL eventually terminates via statement timeout — approximately 30 seconds. The client's `AbortSignal.timeout(30000)` fires at the same time, producing "signal timed out".

**Recursive chain (confirmed via `pg_policies` and `pg_proc`):**

```
portals query (user-role client)
  → portals RLS: is_super_admin() OR is_trader_member(trader_id)
    → is_super_admin() → current_app_role()
      → SELECT role FROM profiles WHERE id = auth.uid()
        → profiles RLS: (id = auth.uid()) OR is_super_admin() OR ...
          → is_super_admin() → current_app_role()
            → SELECT role FROM profiles ...
              → profiles RLS: is_super_admin() ...
                → [ recursion continues until statement timeout ]
```

**Why this was not seen before:** Page load queries to `portals` from the admin page use the server-rendering context, which likely uses the admin client (bypasses RLS). The domains API route incorrectly uses the user-role client for this lookup.

**Why MB-101 did not fix this:** MB-101 removed `provider.add()` (the Vercel API call). The portals RLS recursion is earlier in the execution path and blocks the route before the INSERT regardless of whether `provider.add()` exists.

**Evidence:**
- `website_domains` = 0 rows — INSERT never reached
- `website_domain_events` = 0 rows — writeEvent never reached
- No POST to `website_domains` in Supabase API logs — portals query itself never completes
- `portals` RLS confirmed via `pg_policies`: both policies call `is_super_admin()`
- `is_super_admin()` confirmed via `pg_proc`: calls `current_app_role()`
- `current_app_role()` confirmed via `pg_proc`: `SELECT role FROM profiles WHERE id = auth.uid()`
- `profiles` RLS confirmed via `pg_policies`: calls `is_super_admin()` → recursion closes

---

## Why the Fix is Safe

The route handler has already verified the caller is `super_admin` (lines 141–145 of route.ts check `profile.role !== "super_admin"` and return 403 before this code is reached). Using the admin client for the portals lookup is correct: a verified super_admin is authorised to look up any portal by ID. The admin client simply bypasses a broken recursive RLS check that does not add security at this point in the execution.

All other DB queries in the route already correctly use the `admin` client. The portals lookup is the only exception.

---

## Affected File

**`app/api/website-builder/domains/route.ts`** — two locations.

---

## Implementation Scope

### Change 1 — `add` action: portals lookup (line ~181)

**Find this line:**
```typescript
const { data: resolvedPortal } = input.action === "add"
    ? await supabase.from("portals").select("id,trader_id").eq("id", input.portalId).maybeSingle()
    : { data: null };
```

**Replace with:**
```typescript
const { data: resolvedPortal } = input.action === "add"
    ? await admin.from("portals").select("id,trader_id").eq("id", input.portalId).maybeSingle()
    : { data: null };
```

**Change:** `supabase` → `admin`. One word.

---

### Change 2 — `remove` action: portals UPDATE (line ~379)

This code runs when a domain is removed and was the primary domain — it clears the `custom_domain` field on the portal. Same bug: uses user-role client, would trigger the same RLS recursion if `remove` were tested.

**Find this block:**
```typescript
    await admin
        .from("portals")
        .update({ custom_domain: null })
        .eq("id", workspace.portal.id);
```

This block uses `admin` already — no change needed here. Verify this is the case.

**Also find — line ~373 — the `set_primary_website_domain` RPC:**
```typescript
    await workspace.supabase.rpc("set_primary_website_domain", {
        target_domain_id: replacement.id,
    });
```

Check whether `set_primary_website_domain` is defined as `SECURITY DEFINER`. If it is, RLS is bypassed and this is safe. If it is `SECURITY INVOKER`, this is the same recursion risk. Do not fix here unless confirmed SECURITY INVOKER — note it in the commit message and add to the backlog.

---

## What Does NOT Change

- `lib/domains/provider.ts` — no changes
- `lib/supabase/server.ts` — no changes
- `lib/supabase/admin.ts` — no changes
- `components/website-domain-manager.tsx` — no changes
- Database schema — no changes
- RLS policies — no changes (the RLS recursion is a pre-existing condition; the correct fix is to not use the user-role client for this call, not to rewrite the RLS policies)

---

## Database Impact

No migration. No schema change. No RLS change.

---

## Testing Requirements

1. **Domain add — PASII tab**
   - Navigate to Admin → Domains → PASII tab
   - Enter `www.passii714.com`, click Connect domain
   - Response must arrive in **under 5 seconds**
   - No "signal timed out" error
   - Message banner appears with Vercel dashboard instructions
   - Confirm DB row: `SELECT * FROM website_domains WHERE portal_id = 'eb7f5b51-037a-446d-bfe9-3ea3481099e2'`
   - Row must have `status = 'pending_vercel_setup'`, `hostname = 'www.passii714.com'`

2. **Build must pass**
   - `npm run build` — zero errors before commit

3. **No regressions**
   - Page loads normally for all four academy tabs
   - Refresh and remove actions unaffected

---

## Acceptance Criteria

- Domain connect completes in under 5 seconds
- Row appears in `website_domains` with correct status
- Build green on Vercel
- Architect confirms via `execute_sql`

## Definition of Done

- Build passes on Vercel (green deployment)
- `website_domains` row confirmed via `execute_sql`
- No "signal timed out" error

---

## Note on MB-101

MB-101 changes remain correct and in production. The architectural decision to skip `provider.add()` stands. MB-102 fixes the prerequisite bug that was blocking MB-101 from ever executing.
