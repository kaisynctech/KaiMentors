# Mission Brief MB-103
## Domain Route — Use Admin Client for Profile Role Lookup

**Status:** Approved for Engineering  
**Date:** 2026-07-05  
**Priority:** Critical — Production Blocker (continuing from MB-102)  
**Prepared by:** Enterprise Architect

---

## Background

MB-101 removed `provider.add()`. MB-102 changed the portals lookup to use the admin client. The route still hangs for 30 seconds. Both fixes are correctly deployed. The hang continues.

The profile role lookup on line 140 is the last remaining **user-role client query** in the route handler. The admin client (`createAdminClient()`) is currently constructed at line 156 — AFTER the profile check. So the profile lookup still uses the user-role `supabase` client, which goes through full RLS evaluation.

The profiles RLS policies for SELECT include `shares_conversation_with(id)` (joins `conversation_members`) and `is_super_admin()` → `current_app_role()` → queries `profiles` again. Whether this creates slow evaluation, recursion, or RLS overhead, this is the only remaining unprotected user-role query in the route and the only call that never appears in the Supabase API logs.

---

## Root Cause

```typescript
// Line 140 — USER-ROLE CLIENT — triggers full profiles RLS evaluation
const { data: profile } = user && supabase
  ? await supabase.from("profiles").select("role").eq("id", user.id)
      .abortSignal(AbortSignal.timeout(8000)).maybeSingle()
  : { data: null };
```

The admin client (`admin`) is not yet constructed at this point — it is created at line 156. So this query uses the `supabase` user-role client, triggers all profiles RLS policies, and hangs. The `abortSignal(AbortSignal.timeout(8000))` may or may not work in this context — if it fails to abort, the route hangs indefinitely.

---

## Fix

**Move `createAdminClient()` to the top of the `POST` function** (before the profile lookup). Then **replace the user-role profile query with an admin client query**. The admin client bypasses RLS entirely.

This is architecturally correct: a super_admin API endpoint has no reason to use the user-role client for database reads. The user-role client is only needed to extract the session from the cookie.

After this change, the route handler makes **zero user-role database queries**. The only user-role operation is `supabase.auth.getSession()` (cookie parsing — no network call in @supabase/ssr).

---

## Affected File

`app/api/website-builder/domains/route.ts` — two targeted changes.

---

## Implementation Scope

### Change 1 — Move admin client construction to before the profile check

**Find** the current start of the POST function (around line 129):

```typescript
export async function POST(request: Request) {
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
  const { data: profile } = user && supabase ? await supabase.from("profiles").select("role").eq("id", user.id).abortSignal(AbortSignal.timeout(8000)).maybeSingle() : { data: null };
  if (!supabase || !user || profile?.role !== "super_admin") {
    return NextResponse.json(
      { error: "Super admin access is required." },
      { status: 403 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The domain request is invalid." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server-side domain management is not configured." },
      { status: 503 },
    );
  }
```

**Replace with:**

```typescript
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server-side domain management is not configured." },
      { status: 503 },
    );
  }

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

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The domain request is invalid." },
      { status: 400 },
    );
  }
```

**What changed:**
- `createAdminClient()` moved to the top — checked immediately before anything else
- Profile lookup now uses `admin.from("profiles")` — admin client, no RLS, instant
- Removed `.abortSignal(AbortSignal.timeout(8000))` — not needed on admin client (no RLS, sub-100ms)
- Removed `!supabase` from the 403 guard — `supabase` being null no longer blocks a valid session + admin profile check; the guard is now `!user || profile?.role !== "super_admin"`
- The `const admin = createAdminClient()` block that previously followed `request.json()` is now removed (it's at the top)

---

### Change 2 — Remove the now-duplicate admin client block

**Find and delete** the block that follows `request.json()` parsing:

```typescript
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server-side domain management is not configured." },
      { status: 503 },
    );
  }
```

This is now at the top of the function. Delete the second occurrence.

---

## What Does NOT Change

- `lib/supabase/server.ts` — no changes
- `lib/supabase/admin.ts` — no changes
- `lib/domains/provider.ts` — no changes
- `components/website-domain-manager.tsx` — no changes
- Database schema — no changes
- All other route actions (refresh, set_primary, remove) — no changes
- The `workspace` object construction — `supabase` is still included for the RPC calls in set_primary/remove (which use SECURITY DEFINER, so client choice doesn't matter for those calls)

---

## Security Impact

None. The route still validates the user's session via `supabase.auth.getSession()` (JWT parsing from cookie). The profile role check via admin client is equivalent — it reads the same data, just without going through RLS. An attacker cannot exploit this because:
1. The session JWT is validated by Supabase auth before `getSession()` returns
2. The `user.id` from the session is authoritative — no user can forge a different ID
3. The admin client checks `profiles.role = 'super_admin'` for that exact user ID

---

## Testing Requirements

1. **Domain add — PASII tab**
   - Enter `www.passii714.com`, click Connect domain
   - Response must arrive in **under 5 seconds**
   - No "signal timed out" error
   - DB confirm: `SELECT * FROM website_domains WHERE portal_id = 'eb7f5b51-037a-446d-bfe9-3ea3481099e2'`
   - Row must exist with `status = 'pending_vercel_setup'`

2. **Auth rejection still works**
   - Log in as a non-super_admin user and attempt domain connect
   - Must receive 403 "Super admin access is required."

3. **Build passes**
   - `npm run build` — zero errors before commit

---

## Acceptance Criteria

- Domain connect completes in under 5 seconds
- Row confirmed in `website_domains` via `execute_sql`
- Build green on Vercel
- No "signal timed out" under any condition

## Definition of Done

- Vercel deployment green
- DB row confirmed by Architect via `execute_sql`
