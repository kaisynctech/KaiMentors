# Mission Brief MB-117
## Academy Page Preview and Address Must Show the Client's Live Site

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — Mentors with custom sites see a broken preview and wrong academy address  
**Prepared by:** Enterprise Architect  
**Depends on:** MB-112 (dashboard on custom domain), EP-066 (iframe preview — now stale)

---

## Mission Summary

On **Settings → Academy Page**, mentors with a **custom site package** and an **active custom domain** should see their **real website** in the live preview — not a 404. The **Academy address** field should show their **public site URL** (e.g. `www.passii714.com`), not the platform fallback `/portal/pasii`.

EP-066 wired the preview iframe to `/portal/{slug}`. That works on `kaimentors.vercel.app` but **breaks on custom domains** after MB-112: when a PASII owner opens settings on `passii714.com/dashboard`, the iframe loads `passii714.com/portal/pasii` → 404 / "This academy website is not active yet." Their actual site lives at `passii714.com/`.

---

## Business Objective

The Academy Page tab is the mentor's control panel for their **public-facing website**. For custom-site clients, it must reflect their **real site** — preview, links, and displayed address — not an internal platform route mentors never use in production.

---

## Evidence

| Check | Result |
|---|---|
| `https://www.passii714.com/` | **200 OK** — custom site loads |
| `https://www.passii714.com/portal/pasii` | **404** — preview iframe target |
| PASII `website_delivery_mode` | `custom_package` |
| PASII primary domain | `www.passii714.com` (active) |
| Product Owner screenshot | Live preview shows "This academy website is not active yet." |
| `portal-branding-form.tsx` iframe `src` | `` `/portal/${slug}` `` (line ~508) |
| Academy address UI | Shows `/portal/pasii` (platform path) |

---

## Root Cause

**Preview iframe** uses a platform-only route:

```typescript
// components/portal-branding-form.tsx (custom_package branch)
<iframe src={`/portal/${values.slug || initialPortal.slug}`} />
```

On a custom domain, relative `/portal/{slug}` resolves to `{customDomain}/portal/{slug}`, which middleware rewrites to a non-existent `domain-sites/.../portal/...` path.

**Academy address** always displays `/portal/{slug}` regardless of whether the portal has an active custom domain.

EP-066 was written before MB-112. It assumed mentors always viewed settings from the platform domain.

---

## Expected Behaviour

| Scenario | Live preview iframe | Academy address | Open live site |
|---|---|---|---|
| **Custom site + custom domain** (PASII, TC) | Loads `{customDomain}/` (homepage) | `www.passii714.com` | Opens `/` on custom domain (new tab) |
| **Custom site, no custom domain yet** (Milkers FX) | Loads `/portal/{slug}` on platform | `kaimentors.vercel.app/portal/{slug}` | Opens platform portal URL |
| **Core page academy** (no custom package) | Existing HTML mockup (unchanged) | `/portal/{slug}` (unchanged) |

---

## Architecture Summary

1. **Settings page** loads the portal's **primary active domain** from `website_domains` (`status = 'active'`, `is_primary = true`).
2. Pass new props to `PortalBrandingForm`:
   - `primarySiteHostname: string | null`
   - `isCustomDomainContext: boolean` (from `getMentorWorkspace().customDomain`)
3. **Preview URL resolution** (custom_package only):

```typescript
function getCustomSitePreviewPath(
  slug: string,
  isCustomDomainContext: boolean,
): string {
  return isCustomDomainContext ? "/" : `/portal/${slug}`;
}
```

When `isCustomDomainContext` is true, iframe `src="/"` loads the mentor's homepage on the same custom domain — same-origin, no CORS, shows the real site.

4. **Public site URL** for display and external links:

```typescript
function getPublicSiteHref(
  slug: string,
  primarySiteHostname: string | null,
  isCustomDomainContext: boolean,
): string {
  if (isCustomDomainContext) return "/";
  if (primarySiteHostname) return `https://${primarySiteHostname}`;
  const platform = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaimentors.vercel.app";
  return `${platform}/portal/${slug}`;
}
```

5. **Academy address field** — replace read-only `/portal/{slug}` with:
   - Custom domain: display `www.passii714.com` (hostname only, no path)
   - No custom domain: display `kaimentors.vercel.app/portal/milkers-fx` (platform fallback)

---

## Implementation Scope

### IN scope

- `app/dashboard/settings/page.tsx` — query primary domain; pass new props
- `components/portal-branding-form.tsx` — preview src, open-live-site link, view-public link, academy address display
- Optional: small helper in `lib/academy-routes.ts` if a shared resolver already exists — reuse, do not duplicate

### OUT of scope

- Changing how custom sites are rendered on `/`
- Website builder / core_page academies
- Custom domain DNS or Vercel provisioning
- Renaming the "Academy Page" tab label

---

## Files Expected

| File | Change |
|---|---|
| `app/dashboard/settings/page.tsx` | Query `website_domains` for primary hostname; pass `primarySiteHostname`, `isCustomDomainContext` |
| `components/portal-branding-form.tsx` | Conditional preview src, academy address, external links |
| `lib/academy-routes.ts` (optional) | Add `getPublicSiteEntryHref()` if it fits existing patterns |

---

## Change 1 — `app/dashboard/settings/page.tsx` (branding tab)

After loading `portalData`, query primary domain in parallel:

```typescript
const [{ data: portalData }, { data: riskTemplates }, { data: primaryDomain }] =
  await Promise.all([
    supabase.from("portals").select("*").eq("id", portal.id).single(),
    supabase.from("risk_disclosure_templates")...,
    supabase
      .from("website_domains")
      .select("hostname")
      .eq("trader_id", traderId)
      .eq("status", "active")
      .eq("is_primary", true)
      .maybeSingle(),
  ]);
```

Pass to form:

```tsx
<PortalBrandingForm
  initialPortal={portalData}
  riskTemplates={riskTemplates ?? []}
  websiteDeliveryMode={portalData.website_delivery_mode ?? "core_page"}
  primarySiteHostname={primaryDomain?.hostname ?? null}
  isCustomDomainContext={workspace.customDomain === true}
/>
```

Use the existing `workspace` from `getMentorWorkspace()` at the top of the page — already available.

---

## Change 2 — `components/portal-branding-form.tsx`

### New props

```typescript
interface PortalBrandingFormProps {
  // ...existing...
  primarySiteHostname?: string | null;
  isCustomDomainContext?: boolean;
}
```

### Preview iframe (custom_package branch)

```typescript
const previewSrc =
  isCustomDomainContext ? "/" : `/portal/${values.slug || initialPortal.slug}`;

<iframe src={previewSrc} ... />
```

### Open live site link

```typescript
const liveSiteHref = isCustomDomainContext
  ? "/"
  : primarySiteHostname
    ? `https://${primarySiteHostname}`
    : `/portal/${values.slug || initialPortal.slug}`;
```

### Academy address field

Replace the read-only `/portal/{slug}` display:

```tsx
<label>
  {primarySiteHostname || isCustomDomainContext ? "Public site address" : "Academy address"}
  <span className={styles.slugField}>
    {primarySiteHostname ? (
      <strong>{primarySiteHostname}</strong>
    ) : isCustomDomainContext ? (
      <strong>{typeof window !== "undefined" ? window.location.host : "Your domain"}</strong>
    ) : (
      <>
        <small>/portal/</small>
        <input readOnly value={values.slug} />
      </>
    )}
  </span>
</label>
```

For SSR-safe custom-domain-without-DB-fallback, prefer `primarySiteHostname` from server; `isCustomDomainContext` alone can display hostname from a new optional prop `currentRequestHostname` passed from settings page if needed.

**Recommended:** pass `primarySiteHostname` from DB always when available; pass `currentRequestHostname` from settings page headers for the edge case where mentor is on custom domain but primary flag is missing:

```typescript
// settings page
const headersList = await headers();
const currentHostname = normalizeRequestHostname(
  headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "",
);
// pass currentRequestHostname={!isPlatformHostname(currentHostname) ? currentHostname : null}
```

Display priority: `primarySiteHostname ?? currentRequestHostname ?? /portal/{slug}`.

### View public portal link (form actions)

Update the bottom link to use `liveSiteHref` instead of `portalUrl`.

---

## Regression Risks

| Risk | Mitigation |
|---|---|
| Milkers FX (no domain) preview breaks | Fallback remains `/portal/{slug}` when `!isCustomDomainContext` |
| Core page academies affected | Changes gated on `websiteDeliveryMode === "custom_package"` |
| iframe `/` loads dashboard by accident | `/` on custom domain serves custom site via middleware rewrite — verified PASII 200 |
| XSS via hostname display | Hostname comes from DB `website_domains` — already validated on insert |

---

## Testing Requirements

### Test 1 — PASII (custom site + custom domain) — primary
1. Sign in as PASII owner on `www.passii714.com/dashboard`.
2. Settings → Academy Page.
3. **Pass:** Live preview shows PASII homepage (not 404 / "not active yet").
4. **Pass:** Academy address shows `www.passii714.com` (not `/portal/pasii`).
5. **Pass:** "Open live site" opens PASII homepage in new tab.

### Test 2 — Traders Confidence
Same as Test 1 on `www.md415.com/dashboard/settings?tab=branding`.

### Test 3 — Milkers FX (custom site, no custom domain)
1. Sign in on `kaimentors.vercel.app/dashboard`.
2. Settings → Academy Page.
3. **Pass:** Preview loads `/portal/milkers-fx` (200).
4. **Pass:** Academy address shows platform portal path.

### Test 4 — Core page academy (if any exist)
Preview mockup unchanged — no iframe regression.

---

## Acceptance Criteria

- [ ] Custom-domain mentors see their real homepage in Academy Page live preview
- [ ] Academy address shows custom domain hostname when one exists
- [ ] No "This academy website is not active yet." in preview for active custom sites
- [ ] Milkers FX (no domain) still previews via platform `/portal/{slug}`
- [ ] `npm run build` passes

---

## Definition of Done

- Tests 1–3 pass with screenshots
- Product Owner confirms PASII Academy Page preview matches live site
- Deployed to production

---

## Commit message suggestion

```
fix: MB-117 academy page preview uses custom domain site root, not /portal/slug
```
