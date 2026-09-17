# Mission Brief MB-101
## Domain Connect: Remove Vercel API Dependency on Add — Manual Provider Setup Flow

**Status:** Approved for Engineering  
**Date:** 2026-07-05  
**Priority:** Critical — Production Blocker  
**Prepared by:** Enterprise Architect

---

## Business Objective

Academy owners need to connect custom domains (e.g. `www.passii714.com`) to their workspaces. The current implementation calls the Vercel API automatically when a domain is submitted, and this has failed on every attempt across the entire day. The domain has never once been saved to the database. Client delivery is blocked.

## Business Value

Unblocks custom domain connection for all four active academies today. Removes dependency on a fragile Vercel API integration that has proven unreliable. Domain registration will be immediate and reliable. The Vercel API is retained only for status verification (GET requests), which is simpler and less failure-prone.

---

## Background

The `POST /api/website-builder/domains` route handler (`app/api/website-builder/domains/route.ts`) currently does the following on an `add` action:

1. Authenticates the super admin
2. Inserts a row into `website_domains` with `status: "requested"`
3. Immediately calls `provider.add(hostname)` — a POST to the Vercel API — to register the domain with the deployment
4. Updates the row with the Vercel response
5. Returns to the client

Step 3 has never succeeded. The `VERCEL_DOMAIN_TOKEN` was set to a placeholder URL (`https://api.example.com`) for the entire production life of this feature. Even after replacing it with a real token today, the route continues to time out at 30 seconds on the client side. The `website_domains` table has **zero rows** — the INSERT at step 2 has never been reached.

Root cause of the 30-second hang has not been fully isolated (it occurs before any database write), but the architectural decision is clear: the Vercel API POST on domain add is not necessary for the domain to function. Vercel allows domains to be added manually through its dashboard. The platform only needs to record the domain and later verify its status.

---

## Current Behaviour

- Admin enters domain → clicks Connect domain → spinner runs for 30 seconds → "signal timed out"
- `website_domains` table = 0 rows
- `website_domain_events` table = 0 rows
- Domain is never registered anywhere

## Expected Behaviour

- Admin enters domain → clicks Connect domain → response in under 5 seconds
- Row created in `website_domains` with `status: "pending_vercel_setup"`
- UI displays the domain in the list with clear instructions to add it to the Vercel dashboard
- Admin adds domain in Vercel dashboard (manual step, takes 30 seconds)
- Admin clicks "Check Status" → route inspects via Vercel API GET → status updates to `verification_required` or `active`

---

## Evidence

- `website_domains` rows: **0** (confirmed via `execute_sql`)
- `website_domain_events` rows: **0** (confirmed via `execute_sql`)
- No POST requests to Supabase API from the domains route (confirmed via API logs)
- "signal timed out" = client `AbortSignal.timeout(30000)` fired = server took >30 seconds
- All status fields in `website_domains` are plain `text` — no enum, no migration required for new status values (confirmed via `information_schema.columns`)

---

## Root Cause

The Vercel API call (`provider.add()`) is the blocking operation. Whether due to the previously invalid token, network latency between Vercel lhr1 and Vercel API, or an unresolved hang in the route execution path — the call never completes within acceptable time. Removing it from the add flow eliminates the problem entirely.

---

## Architecture Decision

**Remove `provider.add()` from the `add` action entirely.**

The domain is registered in the KaiMentors database immediately. The admin manually adds the domain to the Vercel project in the Vercel dashboard. The `refresh` action (which calls `provider.inspect()` — a GET request) is used to sync Vercel's state back into the database after the admin completes the Vercel step.

This is architecturally sound because:
- Vercel processes domains the same way regardless of whether they were added via API or dashboard
- The verify/inspect GET calls are simpler and less likely to hang
- The admin-managed Vercel step is a one-time operation per domain that takes 30 seconds
- The full Vercel API POST automation can be re-engineered properly as a dedicated Mission Brief when the platform is stable

---

## Affected Systems

- `app/api/website-builder/domains/route.ts` — `add` action and `refresh` action
- `components/website-domain-manager.tsx` — post-add UI state

## What Does NOT Change

- `lib/domains/provider.ts` — no changes
- `lib/domains/types.ts` — no changes
- `lib/domains/hostnames.ts` — no changes
- `route.ts` — `set_primary` action — no changes
- `route.ts` — `remove` action — no changes
- Database schema — no migration required (all status fields are `text`)
- Vercel environment variables — `VERCEL_DOMAIN_TOKEN` and `VERCEL_PROJECT_ID` remain in place for the verify/inspect calls

---

## Implementation Scope

### File 1: `app/api/website-builder/domains/route.ts`

#### Change A — `add` action: remove provider call, insert with new status

**Locate** the `add` action block. It begins at the `if (input.action === "add")` check and ends before `const domain = existingDomain;`.

**Replace** the entire section from the INSERT through the end of the add action's try/catch block with the following logic:

**Current code to replace** (the INSERT + writeEvent + try/catch for provider.add):
```typescript
const { data: created, error: reserveError } = await admin
  .from("website_domains")
  .insert({
    trader_id: workspace.traderId,
    portal_id: workspace.portal.id,
    hostname,
    provider: "vercel",
    status: "requested",
  })
  .select("*")
  .single();

if (reserveError || !created) {
  return NextResponse.json(
    {
      error:
        reserveError?.code === "23505"
          ? "That domain is already connected to a KaiMentors website."
          : "The domain could not be reserved.",
    },
    { status: reserveError?.code === "23505" ? 409 : 400 },
  );
}

const domain = created as WebsiteDomain;
await writeEvent(admin, {
  domainId: domain.id,
  traderId: workspace.traderId,
  portalId: workspace.portal.id,
  actorUserId: workspace.user.id,
  eventType: "domain_reserved",
  hostname,
  nextStatus: "requested",
});

try {
  const state = await provider.add(hostname);
  const updated = await persistProviderState(admin, domain, state);
  await writeEvent(admin, {
    domainId: domain.id,
    traderId: workspace.traderId,
    portalId: workspace.portal.id,
    actorUserId: workspace.user.id,
    eventType: "provider_domain_added",
    hostname,
    previousStatus: domain.status,
    nextStatus: updated.status,
    details: state.metadata,
  });

  if (updated.status === "active") {
    const { data: primary } = await workspace.supabase
      .from("website_domains")
      .select("id")
      .eq("portal_id", workspace.portal.id)
      .eq("is_primary", true)
      .maybeSingle();
    if (!primary) {
      await workspace.supabase.rpc("set_primary_website_domain", {
        target_domain_id: updated.id,
      });
    }
  }

  return NextResponse.json({ domain: updated }, { status: 201 });
} catch (error) {
  const providerError =
    error instanceof DomainProviderError
      ? error
      : new DomainProviderError(
          "The deployment provider could not add this domain.",
          "provider_request_failed",
          502,
        );
  await admin
    .from("website_domains")
    .update({
      status: "failed",
      ownership_status: "failed",
      dns_status: "failed",
      ssl_status: "failed",
      failure_code: providerError.code,
      failure_message: providerError.message,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", domain.id);
  await writeEvent(admin, {
    domainId: domain.id,
    traderId: workspace.traderId,
    portalId: workspace.portal.id,
    actorUserId: workspace.user.id,
    eventType: "provider_domain_failed",
    hostname,
    previousStatus: "requested",
    nextStatus: "failed",
    details: { code: providerError.code, message: providerError.message },
  });
  return NextResponse.json(
    { error: providerError.message },
    { status: providerError.status >= 500 ? 502 : providerError.status },
  );
}
```

**Replace with:**
```typescript
const { data: created, error: reserveError } = await admin
  .from("website_domains")
  .insert({
    trader_id: workspace.traderId,
    portal_id: workspace.portal.id,
    hostname,
    provider: "vercel",
    status: "pending_vercel_setup",
    ownership_status: "pending",
    dns_status: "pending",
    ssl_status: "pending",
    auth_status: "pending",
    last_checked_at: new Date().toISOString(),
  })
  .select("*")
  .single();

if (reserveError || !created) {
  return NextResponse.json(
    {
      error:
        reserveError?.code === "23505"
          ? "That domain is already connected to a KaiMentors website."
          : "The domain could not be reserved.",
    },
    { status: reserveError?.code === "23505" ? 409 : 400 },
  );
}

const domain = created as WebsiteDomain;
await writeEvent(admin, {
  domainId: domain.id,
  traderId: workspace.traderId,
  portalId: workspace.portal.id,
  actorUserId: workspace.user.id,
  eventType: "domain_registered",
  hostname,
  nextStatus: "pending_vercel_setup",
});

return NextResponse.json(
  { domain, next_step: "manual_vercel_setup" },
  { status: 201 },
);
```

#### Change B — `refresh` action: handle 404 from Vercel gracefully

**Locate** the `refresh` catch block. It currently reads:

```typescript
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The domain status could not be refreshed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
```

**Replace with:**
```typescript
    } catch (error) {
      if (error instanceof DomainProviderError && error.status === 404) {
        return NextResponse.json(
          {
            error:
              "Domain not found in the deployment provider. Add it to your Vercel project at vercel.com/dashboard first, then check the status again.",
          },
          { status: 422 },
        );
      }
      const message =
        error instanceof Error
          ? error.message
          : "The domain status could not be refreshed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
```

#### Change C — Remove the EP-099 diagnostic try/catch wrapper

The outer `try { ... } catch (diagnostic) { ... }` wrapper at lines 130 and 436–445 was a temporary diagnostic measure. Remove it: delete the opening `try {` at line 130 and delete the closing catch block:

```typescript
  } catch (diagnostic) {
    return NextResponse.json(
      {
        error: diagnostic instanceof Error
          ? `[diagnostic] ${diagnostic.name}: ${diagnostic.message}`
          : "[diagnostic] Unknown error",
      },
      { status: 500 },
    );
  }
```

The function should start with `const supabase = await createClient();` directly (no wrapping try) and end with `return NextResponse.json({ status: "removed" });`.

---

### File 2: `components/website-domain-manager.tsx`

#### Change A — Handle `next_step: "manual_vercel_setup"` in `domainAction`

**Locate** the `domainAction` function. After the block that processes `payload.domain` (updates the domain list and sets selectedId), add handling for the `next_step` field.

**Find this existing block:**
```typescript
      if (payload.domain) {
        const domain = payload.domain as WebsiteDomain;
        setDomains((current) => {
          const exists = current.some((entry) => entry.id === domain.id);
          return exists
            ? current.map((entry) => (entry.id === domain.id ? domain : entry))
            : [domain, ...current];
        });
        setSelectedId(domain.id);
      }
```

**Replace with:**
```typescript
      if (payload.domain) {
        const domain = payload.domain as WebsiteDomain;
        setDomains((current) => {
          const exists = current.some((entry) => entry.id === domain.id);
          return exists
            ? current.map((entry) => (entry.id === domain.id ? domain : entry))
            : [domain, ...current];
        });
        setSelectedId(domain.id);
        if (payload.next_step === "manual_vercel_setup") {
          setError(
            `Domain saved. Now add "${domain.hostname}" to your Vercel project at vercel.com/dashboard → select your project → Settings → Domains. Then click "Check Status" below.`,
          );
        }
      }
```

**Note:** `setError` is used here intentionally to display the instruction in the existing error/message banner. If the component has a separate `setSuccess` or `setInfo` state, use that instead for a non-red banner. If not, the message will display in the current error banner — this is acceptable for now and can be styled in a follow-up.

---

## Database Impact

No schema migration required. All status fields in `website_domains` are plain `text` columns with no enum constraint. The new status value `"pending_vercel_setup"` is valid without any DDL change.

---

## Regression Risks

- **`set_primary` action**: requires `domain.status === "active"`. Domains in `pending_vercel_setup` cannot be set as primary. This is correct — a domain that hasn't been verified should not be primary.
- **`remove` action**: works on any status. No risk.
- **Auto-primary logic on active**: the block that auto-sets a domain as primary when `updated.status === "active"` is removed from the add flow. This is acceptable — a domain set to `pending_vercel_setup` is not active yet. When the admin runs refresh and the domain becomes active, the auto-primary logic is not present in the refresh path either. This is a known limitation acceptable for now.
- **EP-099 diagnostic wrapper removal**: the outer try/catch was temporary. Removing it restores the clean route structure. Individual actions already have their own error handling.

---

## Testing Requirements

The engineer must verify all of the following before marking complete:

1. **Domain add — success path**
   - Navigate to Admin → Domains → **PASII tab**
   - Enter `www.passii714.com`, click Connect domain
   - Response must arrive in under 5 seconds
   - Message banner appears with Vercel dashboard instructions
   - Confirm row in DB: `SELECT * FROM website_domains WHERE portal_id = 'eb7f5b51-037a-446d-bfe9-3ea3481099e2'`
   - Row must have `status = 'pending_vercel_setup'`, `hostname = 'www.passii714.com'`

2. **Domain add — duplicate**
   - Try adding `www.passii714.com` again on PASII tab
   - Must return: "That domain is already connected to a KaiMentors website." (409)

3. **Refresh — domain not yet in Vercel**
   - With the domain in `pending_vercel_setup` state, click Check Status (refresh)
   - Must return the 422 message: "Domain not found in the deployment provider. Add it to your Vercel project..."
   - Must NOT return a 502 or generic error

4. **Refresh — after admin adds domain to Vercel dashboard**
   - Admin adds `www.passii714.com` to Vercel project in Vercel dashboard
   - Click Check Status
   - Status must update in `website_domains` to `verification_required` or `active`
   - DB row confirms new status

5. **Other actions unaffected**
   - Remove: add a test domain, then remove it — must work without error
   - Set primary: not testable until a domain is `active`

6. **Build passes**
   - `npm run build` must complete with zero errors before committing

---

## Acceptance Criteria

- Domain add completes in under 5 seconds with no timeout error
- Row created in `website_domains` with `status = 'pending_vercel_setup'`
- UI shows actionable instructions pointing to Vercel dashboard
- Refresh returns clear "not in Vercel yet" message when domain not found
- Refresh updates status correctly once domain is added to Vercel
- `npm run build` passes
- No regressions in remove, set_primary, or refresh actions

## Definition of Done

- Build passes on Vercel (green deployment)
- Domain row confirmed in database via `execute_sql`
- Architect has reviewed the deployment and confirmed acceptance criteria met
- EP-099 diagnostic wrapper removed from `route.ts`

---

## Post-Completion

Once this Mission Brief is complete and the domain connects successfully, the following remain on the backlog:

- Proper Vercel API POST re-integration (automated domain provisioning) — new Mission Brief when platform is stable
- Supabase `getSession()` hang root cause — investigate in a separate Discovery session
- Student verification flow end-to-end test
- EP-092 acceptance-test run (KaiTrades only)
