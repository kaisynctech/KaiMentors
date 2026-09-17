# Mission Brief MB-108
## Fix: `passii714.com` Serving Platform Homepage + Correct Domain Flags

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — PASII custom domain not resolving correctly  
**Prepared by:** Enterprise Architect

---

## Root Cause (Tool-Verified, No Guesswork)

From `lib/domains/hostnames.ts` (file-read confirmed, line 21–36):

```typescript
function configuredPlatformHosts() {
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,   // ← THE PROBLEM
    process.env.VERCEL_URL,
    ...(process.env.KAIMENTORS_PLATFORM_HOSTNAMES ?? "").split(","),
  ]
    .filter(Boolean)
    ...
}
```

Vercel automatically sets `VERCEL_PROJECT_PRODUCTION_URL` to whichever domain is marked as the **primary production domain** in the Vercel project settings. When `passii714.com` is in the Vercel project and is (or was) the primary domain, `VERCEL_PROJECT_PRODUCTION_URL = passii714.com`. This makes `isPlatformHostname('passii714.com')` return `true`, so:

1. Middleware evaluates `customDomain = false`
2. The custom domain rewrite never runs
3. Next.js serves the platform (KaiMentors homepage) for `passii714.com`

The not-found page ("This academy website is not active yet.") is never reached because the request never enters the custom domain path.

**Why `NEXT_PUBLIC_SITE_URL` alone is not enough:**
`NEXT_PUBLIC_SITE_URL` is correctly set to `https://kaimentors.vercel.app` — it covers the platform. `VERCEL_PROJECT_PRODUCTION_URL` was originally included as a fallback for un-configured environments, but in a multi-tenant setup it is actively harmful: any tenant domain set as Vercel's primary production domain becomes a platform hostname.

**Additional DB issues confirmed via execute_sql:**
- `www.passii714.com`: `is_primary: false`, `redirect_to_primary: true` — semantically wrong; this is the domain the site serves on, it should be the primary
- `passii714.com`: no row in `website_domains` — once DNS is confirmed pointing to Vercel, it needs to redirect to `www.passii714.com`

---

## Changes Required

### Change 1 — Remove `VERCEL_PROJECT_PRODUCTION_URL` from platform host detection

**File:** `lib/domains/hostnames.ts`

**Find** (lines 21–26):

```typescript
function configuredPlatformHosts() {
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    ...(process.env.KAIMENTORS_PLATFORM_HOSTNAMES ?? "").split(","),
  ]
```

**Replace with:**

```typescript
function configuredPlatformHosts() {
  // VERCEL_PROJECT_PRODUCTION_URL is deliberately excluded: Vercel auto-sets it to
  // the primary project domain, which in a multi-tenant setup may be a tenant's
  // custom domain rather than the platform URL. NEXT_PUBLIC_SITE_URL is the
  // authoritative platform URL and is always explicitly set.
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    ...(process.env.KAIMENTORS_PLATFORM_HOSTNAMES ?? "").split(","),
  ]
```

**What changed:** One line removed (`process.env.VERCEL_PROJECT_PRODUCTION_URL,`), comment added explaining why.

**Why this is safe:**
- `NEXT_PUBLIC_SITE_URL = https://kaimentors.vercel.app` is always set (confirmed set since June)
- `VERCEL_URL` (deployment-specific URL like `kaimentors-git-main-abc.vercel.app`) is still included — preview deployments cannot be mistaken for tenant custom domains
- `KAIMENTORS_PLATFORM_HOSTNAMES` is still included for any manually listed extras

---

### Change 2 — SQL: Correct `www.passii714.com` flags

Run via Supabase SQL editor or `apply_migration`:

```sql
UPDATE public.website_domains
SET
  is_primary         = true,
  redirect_to_primary = false,
  updated_at         = now()
WHERE id = '5afca7cc-8a25-49d2-a74e-b0511f3a9b12';
-- hostname: www.passii714.com
-- portal_id: eb7f5b51-037a-446d-bfe9-3ea3481099e2
```

**What this fixes:**
- `is_primary: true` — marks `www.passii714.com` as the canonical domain for PASII. The SQL function `resolve_public_website_domain` uses this to set `canonical_hostname` and evaluate `should_redirect` for other domains in the same portal.
- `redirect_to_primary: false` — a primary domain should not redirect to itself. (Currently `redirect_to_primary: true` combined with no primary row means `should_redirect = false` by accident — this corrects the intent.)

---

### Change 3 — SQL: Insert `passii714.com` as active redirect domain

`passii714.com` is already serving content via Vercel (confirmed: the apex loads the KaiMentors homepage), which means:
- DNS A/ALIAS record for `passii714.com` is already pointing to Vercel ✓
- Vercel already has SSL provisioned for it ✓
- No DNS propagation wait required

Run via Supabase SQL editor or `apply_migration`:

```sql
INSERT INTO public.website_domains (
  trader_id,
  portal_id,
  hostname,
  provider,
  status,
  ownership_status,
  dns_status,
  ssl_status,
  auth_status,
  is_primary,
  redirect_to_primary
)
VALUES (
  '63d25433-3056-4b37-8cff-b259963856ca',  -- trader_id (PASII)
  'eb7f5b51-037a-446d-bfe9-3ea3481099e2',  -- portal_id (PASII)
  'passii714.com',
  'vercel',
  'active',
  'pending',
  'configured',
  'ready',
  'configured',
  false,    -- not primary; www.passii714.com is primary
  true      -- redirect to primary (www.passii714.com)
);
```

**What this achieves:**
- `resolve_public_website_domain('passii714.com')` will now return a result
- `should_redirect = true` (because `redirect_to_primary = true` AND primary domain `www.passii714.com` exists AND `www.passii714.com ≠ passii714.com`)
- `canonical_hostname = www.passii714.com`
- The page handler at `app/domain-sites/[hostname]/[[...path]]/page.tsx` line 103–108 fires `redirect(https://www.passii714.com/...)` — a proper 307 redirect

---

## What Does NOT Change

- `middleware.ts` — no changes
- `lib/domains/resolution.ts` — no changes
- `next.config.ts`, `vercel.json` — no changes
- All auth, route protection, and session logic — untouched
- All other portals — unaffected

---

## Build and Commit

Apply the DB changes first (they take effect immediately, no deploy required). Then:

```bash
npm run build
# must be zero errors

git add lib/domains/hostnames.ts
git commit -m "fix: remove VERCEL_PROJECT_PRODUCTION_URL from platform host detection"
git push origin HEAD:main
```

---

## Testing

After Vercel deployment is green:

**Test A — `passii714.com` redirects to `www.passii714.com`:**
1. Visit `http://passii714.com` or `https://passii714.com` in a browser
2. Must redirect (307 or 301) to `https://www.passii714.com`
3. Must then show the full PASII custom site with dark background and gold text
4. Must NOT show the KaiMentors platform homepage

**Test B — `www.passii714.com` serves the PASII custom site:**
1. Visit `https://www.passii714.com` directly
2. Must show the PASII custom site with dark background, gold text, no "Powered by KaiMentors" (or as configured)
3. Matches `kaimentors.vercel.app/portal/pasii` in appearance
4. DevTools Network: `styles.css` returns 200, `app.js` returns 200

**Test C — platform is unaffected:**
1. Visit `https://kaimentors.vercel.app`
2. Must still show the KaiMentors platform homepage (no regression)

---

## Definition of Done

- Vercel deployment green
- `passii714.com` → 307 redirect → `www.passii714.com` → PASII custom site with full styling
- `kaimentors.vercel.app` still shows the platform homepage
- Architect confirms via execute_sql:

```sql
SELECT hostname, status, is_primary, redirect_to_primary, dns_status, ssl_status
FROM public.website_domains
WHERE portal_id = 'eb7f5b51-037a-446d-bfe9-3ea3481099e2'
ORDER BY is_primary DESC;
```

Expected:

| hostname | status | is_primary | redirect_to_primary |
|---|---|---|---|
| www.passii714.com | active | true | false |
| passii714.com | active | false | true |
