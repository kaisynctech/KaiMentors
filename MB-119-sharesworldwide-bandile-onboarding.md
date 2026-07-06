# Mission Brief MB-119
## Onboard Bandile — Sharesworldwide Academy + Custom Site

**Status:** Approved for Engineering — **workspace provision blocked on Bandile email**  
**Date:** 2026-07-06  
**Updated:** 2026-07-06 — PO: no Bandile email yet; kaisynctech interim access; domain deferred  
**Priority:** High — New production client mentor  
**Prepared by:** Enterprise Architect  
**Depends on:** Existing academy provisioning (`provision_invited_academy`, `scripts/provision-academy-invitation.mjs`)

---

## Mission Summary

Add **Bandile** as owner of a new production workspace **Sharesworldwide**, assign the custom site at `public/custom-sites/bandi-shares-main`, and prepare the portal for custom domain **`www.sharesworldwide.trade`**.

The site source already exists in-repo with portal slug **`bandi-shares`** (`config/site.ts`). Workspace display name should be **Sharesworldwide** per Product Owner.

---

## Business Objective

Bandile receives a fully provisioned KaiMentors workspace — owner account, portal, custom site assignment, dashboard access — with the Sharesworldwide website live on the platform (and custom domain when DNS is connected). Students use Join Academy / Sign In on the branded domain; Bandile manages students, courses, and messaging from the mentor dashboard.

---

## Key Facts (from repo)

| Item | Value |
|---|---|
| Mentor name | Bandile |
| Workspace / portal display name | **Sharesworldwide** |
| Portal slug | `bandi-shares` (already in `config/site.ts` — do not change) |
| Package key | `bandi-shares` |
| Site folder | `public/custom-sites/bandi-shares-main/` |
| Intended custom domain | `www.sharesworldwide.trade` — **deferred** (PO will connect later) |
| XM partner code | `BANDISHARES05` |
| Site stack | **Next.js 16 App Router** (not static HTML) |

**Site pages (App Router):**

| Path | File |
|---|---|
| `/` | `app/page.tsx` |
| `/about` | `app/about/page.tsx` |
| `/services` | `app/services/page.tsx` |
| `/pricing` | `app/pricing/page.tsx` |
| `/xm` | `app/xm/page.tsx` |
| `/verify` | `app/verify/page.tsx` (+ server action → `/api/verify-xm`) |
| `/terms` | `app/terms/page.tsx` |
| `/refund-policy` | `app/refund-policy/page.tsx` |

Redirect: `/apply` → `/verify`

---

## Architecture Blocker — Next.js vs Static HTML Renderer

Existing client sites (TC, Milkers FX, PASII) use **static HTML** under `public/custom-sites/{key}/v1/`. KaiMentors loads them via `lib/custom-sites.ts` → `readFile(...page.file)` → `CustomSiteRenderer`.

**`bandi-shares-main` is a standalone Next.js 16 app.** It will **not** render through the current custom-package pipeline without additional work.

### Approved delivery path (two phases)

**Phase A — Workspace live (this brief, required now)**

1. Register `bandi-shares` custom site package in DB (manifest documents intended pages).
2. Provision Bandile's owner account + workspace + package assignment.
3. Mentor dashboard works immediately on platform domain: `/portal/bandi-shares/dashboard` (or after custom domain: `www.sharesworldwide.trade/dashboard`).
4. Set `show_powered_by = false` on assignment (white-label invariant).
5. Commit `public/custom-sites/bandi-shares-main/` to repo if not already tracked.

**Phase B — Public website live (same brief, engineering sub-task)**

Choose **one** approach — recommend **B1** for speed:

| Option | Approach | Pros | Cons |
|---|---|---|---|
| **B1 — Static export** | `next build` with `output: 'export'` → output to `public/custom-sites/bandi-shares/v1/` as HTML | Reuses existing renderer; matches TC/PASII pattern | Refactor `/verify` server action to client `fetch` KaiMentors `/api/verify-xm`; fix any SSR-only APIs |
| **B2 — In-app routes** | Move site into main KaiMentors app under dedicated route group | Full Next.js features on custom domain | Larger refactor; scope creep |
| **B3 — External host** | `website_delivery_mode = external_website` + separate Vercel project | Site deploys independently | Split hosting; auth links must still point to KaiMentors routes |

**Recommendation:** **B1** — static export to `bandi-shares/v1`, update package `asset_base_path` to `/custom-sites/bandi-shares/v1`, manifest maps `.html` files.

Until Phase B completes, portal may show core page fallback or 404 on public routes — **dashboard and student flows still work** once workspace is provisioned.

---

## Product Owner Decisions (2026-07-06)

### Interim platform access — `kaisynctech@gmail.com`

The PO will manage Sharesworldwide alongside Bandile **for now** using **`kaisynctech@gmail.com`**.

**No extra provisioning step is required for this.** Every new workspace trigger `traders_auto_add_system_owner` already inserts `kaisynctech@gmail.com` (`44213ee5-da12-4d06-a7d9-1601d42e79c3`) into `trader_members` with role **`owner`** on `traders` INSERT. After Sharesworldwide is provisioned, the PO can switch to that workspace on the platform domain and access `/dashboard` immediately.

**Important constraint:** `traders.owner_user_id` is **unique per profile** — one person can be the legal owner of only one workspace row. `kaisynctech@gmail.com` already owns another tenant (platform/acceptance). It **cannot** also be `traders.owner_user_id` for Sharesworldwide. Bandile must hold legal ownership via his own email; the PO accesses via auto-added membership.

### Custom domain — deferred

`www.sharesworldwide.trade` is confirmed as the intended domain but **not connected in this phase**. Public entry for now:

- Platform: `https://kaimentors.vercel.app/portal/bandi-shares`
- Join: `/portal/bandi-shares/join-academy`
- Login: `/portal/bandi-shares/login`

Custom domain connect follows MB-101 / existing domain workflow when PO is ready.

### No Bandile email yet — what to do now vs later

**Cannot do yet (requires Bandile's email):**

- Create auth user / owner profile
- Run `provision_invited_academy`
- Sharesworldwide dashboard, students, messaging, or workspace invite link

**Can do now (no email needed):**

1. Apply package migration (`bandi-shares` in `custom_site_packages`).
2. Commit `public/custom-sites/bandi-shares-main/` to repo.
3. Static export to `public/custom-sites/bandi-shares/v1/` (Phase B).
4. Add `/api/verify-xm` if missing.

When PO receives Bandile's email, run provision (5-minute step). No rework of package or site files.

**Do not** use a fake/placeholder email — OTP account setup requires a real inbox.

---

## Information Required from Product Owner

Before provisioning, confirm:

| Field | Status |
|---|---|
| **Bandile's email** (legal workspace owner — `traders.owner_user_id`) | **Not available yet — blocks workspace provision** |
| Interim PO access | **`kaisynctech@gmail.com`** — automatic once workspace exists |
| Legal entity name (for `traders.legal_name`) | Default: `Sharesworldwide` |
| `show_powered_by` | **false** (mandatory) |
| Environment | `production` |
| Custom domain | **Deferred** |

---

## Implementation Scope

### IN scope

1. SQL migration: register `bandi-shares` custom site package + route rules.
2. Atomic workspace provision via `provision_invited_academy` (admin API or `provision-academy-invitation.mjs`).
3. Static export pipeline (Phase B1) OR document deferral with `core_page` interim if export blocked.
4. Commit untracked `bandi-shares-main` assets to repo.
5. Create `/api/verify-xm` on main KaiMentors app if missing (verify page dependency).
6. EP-119 implementer checklist.

### OUT of scope

- **Custom domain** DNS/Vercel connect (`www.sharesworldwide.trade`) — PO will add later (MB-101 pattern).
- Whop integration changes.
- Course content seeding.
- Ownership transfer to Bandile — separate step once his email is confirmed (use `trader_ownership_transfers` when ready).

---

## Database Changes

**New migration:** `supabase/migrations/202607061500_bandi_shares_custom_site_package.sql`

```sql
insert into public.custom_site_packages (
  package_key, version, name, description, category,
  asset_base_path, entry_page, manifest, editable_schema
)
values (
  'bandi-shares',
  1,
  'Sharesworldwide',
  'Bandi Shares FX — macroeconomics forex education, XM partner setup, Whop programs.',
  'Forex academy',
  '/custom-sites/bandi-shares/v1',
  'index',
  '{
    "pages": [
      {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
      {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
      {"slug": "services", "file": "services.html", "label": "Services", "path": "/services"},
      {"slug": "pricing", "file": "pricing.html", "label": "Pricing", "path": "/pricing"},
      {"slug": "xm", "file": "xm.html", "label": "XM Setup", "path": "/xm"},
      {"slug": "verify", "file": "verify.html", "label": "Verify Account", "path": "/verify"},
      {"slug": "terms", "file": "terms.html", "label": "Terms", "path": "/terms"},
      {"slug": "refund-policy", "file": "refund-policy.html", "label": "Refund Policy", "path": "/refund-policy"}
    ],
    "reservedLinks": {
      "login.html": "/login",
      "signup.html": "/join-academy"
    },
    "poweredByLabel": "Powered by KaiMentors"
  }'::jsonb,
  '[
    {"key": "announcement", "label": "Website announcement", "type": "text", "default": ""},
    {"key": "whatsapp", "label": "WhatsApp number", "type": "text", "default": ""},
    {"key": "instagram", "label": "Instagram URL", "type": "url", "default": "https://www.instagram.com/bandishares/"},
    {"key": "tiktok", "label": "TikTok URL", "type": "url", "default": "https://www.tiktok.com/@bandishares"},
    {"key": "brokerLink", "label": "XM register link", "type": "url", "default": "https://www.xm.com"},
    {"key": "partnerCode", "label": "XM partner code", "type": "text", "default": "BANDISHARES05"}
  ]'::jsonb
)
on conflict (package_key, version) do update set
  name = excluded.name,
  description = excluded.description,
  asset_base_path = excluded.asset_base_path,
  manifest = excluded.manifest,
  editable_schema = excluded.editable_schema,
  is_active = true;

-- Route rules (same pattern as passii)
insert into public.custom_site_route_rules (package_id, source_path, target_type, target_value, sort_order)
select package.id, route.source_path, route.target_type, route.target_value, route.sort_order
from public.custom_site_packages package
cross join (values
  ('/login', 'kaimentors_route', '/login', 10),
  ('/academy', 'kaimentors_route', '/student', 20),
  ('/student', 'kaimentors_route', '/student', 30),
  ('/join-academy', 'kaimentors_route', '/join-academy', 40),
  ('/apply', 'package_page', '/verify', 50)
) as route(source_path, target_type, target_value, sort_order)
where package.package_key = 'bandi-shares'
on conflict (package_id, source_path) do update set
  target_type = excluded.target_type,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = true;
```

**Note:** `asset_base_path` points to `v1/` — HTML files must exist there after static export (Phase B).

---

## Workspace Provisioning

Use existing atomic RPC. **Owner must be Bandile's email** (new auth user). PO access is automatic.

### Standard flow (once Bandile's email is known)

```bash
node scripts/provision-academy-invitation.mjs \
  --email "<bandile-email>" \
  --full-name "Bandile" \
  --legal-name "Sharesworldwide" \
  --display-name "Sharesworldwide" \
  --slug "bandi-shares" \
  --package-key "bandi-shares" \
  --invited-by "kaisynctech@gmail.com" \
  --environment "production"
```

Or `POST /api/admin/academy-invitations` with the same fields.

**After provision — verify PO access:**

```sql
select tm.role, p.email
from trader_members tm
join profiles p on p.id = tm.user_id
join portals po on po.trader_id = tm.trader_id
where po.slug = 'bandi-shares'
order by tm.role;
```

**Pass:** rows for Bandile (owner member) **and** `kaisynctech@gmail.com` (owner member via trigger).

### Do not use kaisynctech as `owner_user_id`

The standard invitation API returns **409** if the email already exists. Even bypassing that, `traders.owner_user_id` unique constraint blocks a second workspace owned by the same profile. Use Bandile's email for provision; PO uses auto-added membership.

### Post-provision SQL (mandatory white-label)

```sql
update public.custom_site_assignments csa
set show_powered_by = false
from public.portals p
where csa.portal_id = p.id
  and p.slug = 'bandi-shares';
```

System owner (`kaisynctech@gmail.com`) is auto-added to workspace via existing trigger.

---

## Phase B — Static Export Steps (B1)

1. In `bandi-shares-main/next.config.js` add `output: 'export'` and `trailingSlash: true` if needed.
2. Replace `app/verify/actions.ts` server action with client-side POST to KaiMentors `/api/verify-xm` (create route if absent).
3. Run `npm run build` inside `bandi-shares-main/`.
4. Copy `out/` → `public/custom-sites/bandi-shares/v1/` (rename `.html` paths to match manifest).
5. Copy `public/assets/` from export into `v1/assets/`.
6. Verify `loadCustomSiteBySlug('bandi-shares')` returns home page HTML.
7. Update Navbar/Footer portal links in exported HTML via existing `rewriteHtml` reserved link injection — or ensure source uses `/join-academy` and `/login` (already in `config/site.ts` `PORTAL_LINKS`).

**Join/Login links in source** (`config/site.ts`):

- Custom domain: `/join-academy`, `/login` (correct)
- Platform preview: set `NEXT_PUBLIC_PLATFORM_ORIGIN` during export if needed

---

## Files Expected

| File | Action |
|---|---|
| `supabase/migrations/202607061500_bandi_shares_custom_site_package.sql` | Create |
| `public/custom-sites/bandi-shares-main/**` | Commit (currently untracked) |
| `public/custom-sites/bandi-shares/v1/**` | Create via static export (Phase B) |
| `app/api/verify-xm/route.ts` | Create if missing (XM verification for /verify page) |
| `engineering-prompts/EP-119-sharesworldwide-onboarding.md` | Create |

---

## Testing Requirements

### Test 1 — Package registered

```sql
select package_key, asset_base_path, is_active
from custom_site_packages where package_key = 'bandi-shares';
```

**Pass:** one active row, version 1.

### Test 2 — Workspace provisioned

```sql
select p.slug, p.portal_name, t.display_name, pr.email, pr.role
from portals p
join traders t on t.id = p.trader_id
join profiles pr on pr.id = t.owner_user_id
where p.slug = 'bandi-shares';
```

**Pass:** owner email = Bandile's; `portal_name = Sharesworldwide`; `role = trader`.

### Test 3 — Assignment white-label

```sql
select show_powered_by, status from custom_site_assignments csa
join portals p on p.id = csa.portal_id where p.slug = 'bandi-shares';
```

**Pass:** `show_powered_by = false`, `status = active`.

### Test 4 — Owner account setup

1. Bandile receives OTP → completes account setup → sets password.
2. **Pass:** Lands on dashboard (`/dashboard` on platform or custom domain once connected).

### Test 5 — Public site (after Phase B)

1. Visit `kaimentors.vercel.app/portal/bandi-shares`.
2. **Pass:** Sharesworldwide home page renders; Join Academy / Sign In links work.

### Test 6 — PO interim access

1. Sign in as `kaisynctech@gmail.com` on platform domain.
2. Switch workspace to Sharesworldwide (workspace selector / `km_workspace` cookie).
3. **Pass:** Dashboard loads for `bandi-shares` tenant.

### Test 7 — Student entry (deferred until custom domain)

Skipped until domain connected. For now test `/portal/bandi-shares/join-academy` on platform URL.

---

## Acceptance Criteria

- [ ] `bandi-shares` package registered in DB
- [ ] Bandile owner account provisioned with slug `bandi-shares`
- [ ] Portal display name **Sharesworldwide**
- [ ] Custom site assignment active, `show_powered_by = false`
- [ ] `bandi-shares-main` committed to repo
- [ ] Static export to `bandi-shares/v1` OR documented interim with PO approval
- [ ] `/portal/bandi-shares` serves website (Phase B)
- [ ] `npm run build` passes on main KaiMentors app
- [ ] Product Owner confirms Bandile can access dashboard

---

## Definition of Done

- Migration applied to production
- Bandile completes account setup and accesses mentor dashboard
- Public website renders on platform URL (Phase B)
- Product Owner provides custom domain DNS when ready (follow-on, not blocking workspace)

---

## Commit message suggestion

```
feat: MB-119 Sharesworldwide onboarding — bandi-shares package and workspace
```
