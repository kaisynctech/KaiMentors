# KaiMentors Enterprise Architect Handover
**Date:** 2026-07-06  
**Prepared by:** Outgoing Enterprise Architect  
**For:** Incoming Enterprise Architect  
**Project:** KaiMentors / Kaisync Platform  

---

## 1. Who You Are

You are the **Enterprise Architect for the Kaisync/KaiMentors platform**. Your role is simultaneously CTO, Enterprise Architect, Principal Engineer, and the Product Owner's (Nyarie's) technical partner.

**You do not edit files. You do not write code. You do not commit or push to git — ever.** The single exception: pushing to GitHub after the Product Owner explicitly says "push it" or grants permission. Read-only diagnostics (Supabase SQL queries via MCP, file reads, log reads) are permitted at any time.

Your output is always a **Mission Brief**. Nyarie hands the Brief to the engineer. The engineer implements and reports back. You review.

Read the KEES founding documents before anything else:
- `Long files/Kaisync_Development_Constitution.docx`
- `Long files/Kaisync_Enterprise_Architect_Manual.docx`
- `Long files/Kaisync_Implementation_Specialist_Manual.docx`
- `Long files/Kaisync_Mission_Brief_Standard.docx`
- `Long files/Kaisync_Engineering_Knowledge_System.docx`
- `Long files/Kaisync_Platform_Standards_Manual.docx`
- `Architecture/Kaisync_Enterprise_Architect_Operating_Directive.docx`

All under `C:\Users\NN\Documents\KaiFlow\KaiMentors\`

---

## 2. Platform Overview

**KaiMentors** is a multi-tenant white-label SaaS platform for online academies. It is the invisible engine. Clients run their own branded academy on top of it. Students and mentors of any client portal must never see or feel the KaiMentors brand.

**Stack:**
- Next.js 15.2.4, App Router, TypeScript
- Supabase (project `jsbpfhfmumjbrnymhtvq`, eu-west-1 Ireland, Pro plan)
- Vercel (project `kaimentors`, region lhr1 London, Hobby plan)
- `@supabase/ssr ^0.6.1`, `@supabase/supabase-js ^2.49.4`

**Repository:** `kaisynctech/KaiMentors` on GitHub (SSH alias `github-kaimentors`)

**Production URLs:**
- Platform: `kaimentors.vercel.app`
- Supabase API: `jsbpfhfmumjbrnymhtvq.supabase.co`

---

## 3. Active Client Portals

| Portal | Slug | Custom Domain | Trader ID | Status |
|---|---|---|---|---|
| KaiTrades | `kaitrades` | none | `cf6c1fc0-fe69-41cd-bb38-ad06fa098dfc` | Internal acceptance-test only |
| Traders Confidence | `traders-confidence` | `www.md415.com` | `c2818620-067e-4d4a-9296-41e616215b4e` | Production |
| Milkers FX | `milkers-fx` | TBD | `b0812f8d-1ab0-4409-ad58-4f0cc812ad51` | Production (owner activation pending) |
| PASII | `pasii` | `www.passii714.com` | `63d25433-3056-4b37-8cff-b259963856ca` | Production |

**KaiTrades is the only accepted acceptance-test tenant.** Never use TC or Milkers FX as test fixtures.

**Platform owner:** `kaisynctech@gmail.com` (super_admin). Auto-added to every new workspace via DB trigger `traders_auto_add_system_owner`.

---

## 4. Architectural Invariants (Never Break These)

### Multi-tenancy
- Every DB query must be scoped to `trader_id`. RLS enforces this but application code must also be correct.
- No cross-tenant data must ever be accessible, even to the platform owner via the dashboard.
- `getMentorWorkspace()` is the single source of truth for resolving which workspace a mentor is in.

### White-label isolation
- Students and mentors of any portal must never see "KaiMentors" anywhere — not in the UI, not in browser tab titles, not in page copy, not in domain names.
- The mentor dashboard now lives on the client's custom domain (e.g. `www.passii714.com/dashboard`). Do not ever add logic that redirects `/dashboard` on a custom domain back to the platform domain.
- `show_powered_by = false` for all portals in `custom_site_assignments`. Any new portal must have this set immediately.

### Workspace resolution
**Custom domain:** `getMentorWorkspace()` reads hostname from `x-forwarded-host` header → looks up `website_domains` table → gets `trader_id` → validates user membership → returns that portal's workspace. The `km_workspace` cookie is ignored on custom domains.

**Platform domain (`kaimentors.vercel.app`):** `getMentorWorkspace()` reads `km_workspace` cookie → falls back to oldest membership. The cookie is set by `/api/workspace/activate` (POST, same-domain portal login) or `/api/workspace/goto` (GET, cross-domain chain — now mostly legacy but preserved).

### Domain platform host detection
`configuredPlatformHosts()` reads `NEXT_PUBLIC_SITE_URL`, `VERCEL_URL`, `KAIMENTORS_PLATFORM_HOSTNAMES`. **Never re-add `VERCEL_PROJECT_PRODUCTION_URL`** — Vercel auto-sets it to the primary project domain which in a multi-tenant setup is a tenant's custom domain. Re-adding it would cause tenant domains to be treated as the platform.

### Middleware
`middleware.ts` handles all custom domain routing. Key rules:
- Custom domain requests to `/admin`, `/onboarding`, `/account-setup`, `/recover` → redirected to platform.
- Custom domain requests to `/dashboard` and `/join/` → `NextResponse.next()` (served natively, not rewritten through `domain-sites/`).
- Custom domain requests to all other paths → rewritten through `customDomainDestination()` → served from `app/domain-sites/[hostname]/`.
- Custom domain requests to `/student/*` → redirected to `/academy/*` (browser URL). The `/academy/*` path is then rewritten by `customDomainDestination` to `/student/*` for Next.js.
- Never add `/dashboard` back to the platform redirect block.

---

## 5. Work Completed This Session (2026-07-06)

All committed and deployed. All tests passed.

| Commit | Brief | Summary |
|---|---|---|
| `9a4d1b8` | MB-108 | `passii714.com` apex domain was showing KaiMentors homepage. Root cause: `VERCEL_PROJECT_PRODUCTION_URL` in `configuredPlatformHosts()` absorbed the tenant's primary Vercel domain. Removed. |
| `f3a1b9f` | MB-109 | Cross-domain login contamination: custom domain login set `km_workspace` cookie on wrong domain. Fixed via `/api/workspace/goto` GET endpoint that sets cookie on platform domain via top-level navigation. |
| `a1d7c88` | MB-110 | Platform login page ignored `next` URL param — super_admin always landed on `/admin`, breaking the goto chain. Added `searchParams` to `LoginPage`, `next` prop to `LoginForm`. |
| `486560a` | MB-111 | Full white-label audit: removed all KaiMentors brand text from student/mentor-facing pages (7 leak points). Added `app/domain-sites/layout.tsx` and `app/student/layout.tsx` to override root title template. |
| `8548ce5` | MB-112 | Mentor dashboard now served on client's custom domain. `getMentorWorkspace()` resolves workspace from hostname on custom domains. Signout route fixed for custom domain context. |
| `8202413` | MB-113 | Workspace invite link (`/join/workspace/[token]`) was 404ing on custom domains — middleware was rewriting it through `domain-sites/`. Added `/join/` to the pass-through list in `makeResponse()`. |
| `9ed4ae3` | MB-114 | Student "no application" redirect sent to `/academy/join-academy` or `/student/join-academy` (both non-existent). Added `joinAcademyPath` to `StudentAcademyContext` in `lib/student-routing.ts`. Fixed 6 pages. |
| `43ab1d7` | MB-114 ext | Extended fix to 6 more student pages (`bookings`, `live-classes`, `courses`, `groups`, `resources`, `bookings/sessions`). |

---

## 6. Known Pending Items

### Immediate (first things to address)
1. **`kaisyncworkflow.com` Resend verification** — TC email delivery depends on this domain being confirmed in the Resend dashboard. Owner must verify. Until confirmed, invitation emails may fail silently (the copy-link feature is the workaround).

2. **EP-092 acceptance-test run** — Full portal isolation verification using KaiTrades tenant only. This was deferred during the Supabase infrastructure incident (June 30 – July 3) and has not been run since infrastructure stabilised.

3. **Student verification flow end-to-end test** — The student registration → OTP → broker connection → screenshot upload → verification flow has not been tested end-to-end since EP-019. Run through the full student lifecycle on KaiTrades.

4. **Browser acceptance screenshots for EP-014** — 8 screenshots needed (4 scenarios × desktop + mobile). Still outstanding from the student portal redesign.

### Architectural (medium priority)
5. **`/account-setup` and `/recover` on custom domain** — Currently redirected to the platform domain (mentors see `kaimentors.vercel.app` during account setup and password recovery). For full white-label completion these should eventually be served on the custom domain, similar to what MB-112 did for `/dashboard`. Not urgent but noted.

6. **Milkers FX owner activation** — The owner invitation for `nyaradzondoro1@gmail.com` was pending. Check if they have activated their account and confirm the portal is fully working.

7. **Vercel plan** — Currently Hobby. Memory usage has exceeded the limit. Consider Pro upgrade when budget allows. Supabase is already on Pro ($25/month).

8. **`app/student/join-academy/page.tsx` missing** — On the platform domain, there is no `app/student/join-academy` page. `joinAcademyPath` for platform now correctly routes to `/portal/[slug]/join-academy` which does exist. This is resolved but worth noting there is no `/student/join-academy` page if that path is ever accessed directly.

---

## 7. Key DB Facts

**Tables you will touch most:**
- `traders` — one per portal owner. Has `invite_token` for workspace invite links.
- `trader_members` — membership table (owner/mentor per trader). No `portal_id` column — portal is resolved via `traders → portals`.
- `portals` — one per trader. `custom_domain`, `slug`, `portal_name`, `is_published`.
- `website_domains` — custom domain registry. Columns: `hostname`, `status`, `trader_id`, `is_primary`, `redirect_to_primary`, `dns_status`, `ssl_status`. `status = 'active'` required for routing to work.
- `custom_site_assignments` — links portals to site packages. `show_powered_by` must be `false` for all client portals.
- `custom_site_packages` — site package definitions including `manifest` JSONB. `reservedLinks` maps `signup.html → /join-academy`, `login.html → /login` for all packages.
- `profiles` — one per Supabase auth user. `role`: `super_admin`, `trader`, `student`.
- `student_applications` — student registrations per portal.

**Supabase version note:** `@supabase/supabase-js ^2.49.4`. The method `getUserByEmail()` does **not** exist. Use `listUsers()` + `.find()` instead. This was a prior Architect error — do not repeat it.

---

## 8. Code Structure Reference

```
app/
  admin/           → Platform admin (super_admin only)
  dashboard/       → Mentor dashboard (served on custom domain after MB-112)
  student/         → Student portal (served on custom domain via /academy/* URL)
  academy/         → Platform-domain student portal pages (same structure as student/)
  domain-sites/
    [hostname]/
      [[...path]]/   → Custom site page renderer
      join-academy/  → Student registration form
      login/         → Academy login form
  portal/
    [slug]/          → Platform-domain portal entry (login, join-academy, pages)
  join/
    workspace/[token]/ → Mentor workspace invite join flow
  api/
    workspace/
      activate/    → POST: sets km_workspace cookie (same-domain portal logins)
      goto/        → GET: sets km_workspace cookie via top-level navigation (cross-domain chain)
    student/       → Student-facing APIs
    join/          → Workspace join APIs

lib/
  workspace.ts           → getMentorWorkspace() — THE workspace resolver
  student-routing.ts     → getStudentAcademyContext() — student context per domain/portal
  domains/
    hostnames.ts         → isPlatformHostname(), normalizeRequestHostname(), configuredPlatformHosts()
    resolution.ts        → resolveWebsiteDomain()
  academy-routes.ts      → getAcademyEntryHref() — generates correct URLs for academy entry points
  custom-sites.ts        → rewriteHtml() — processes custom site HTML, maps reserved links

components/
  dashboard-shell.tsx    → Mentor dashboard chrome (sidebar, nav). mentor mode: no KaiMentors text.
  academy-login-page.tsx → Custom domain / portal login page renderer
  academy-join-page.tsx  → Student registration page renderer
  login-form.tsx         → Shared login form. academyContext.customDomain=true → skip activate call
  join-workspace-form.tsx → Mentor invite join form. Redirects to /dashboard on complete.
```

---

## 9. Custom Domain Routing — Full Flow Reference

**Request arrives at `www.passii714.com/anything`:**

1. Middleware: `customDomain = !isPlatformHostname("www.passii714.com")` → `true`
2. If path is `/admin`, `/onboarding`, `/account-setup`, `/recover` → redirect to `kaimentors.vercel.app`
3. If path is `/dashboard` or `/join/*` → `NextResponse.next()` (served natively)
4. If path is `/student/*` → redirect to `/academy/*` (browser URL change)
5. If path is `/login` → rewrite to `app/domain-sites/www.passii714.com/login/page.tsx`
6. If path is `/academy/*` → rewrite to `app/student/*`
7. Everything else → rewrite to `app/domain-sites/www.passii714.com/[[...path]]/page.tsx`

**Auth guard in middleware:**
- Protected paths: `/dashboard`, `/admin`, `/student` (and `/academy` which maps to `/student`)
- Unauthenticated → redirect to `/login` (on custom domain, this serves the portal login page)
- Wrong role → redirect away

---

## 10. Non-Negotiable Rules From The Product Owner

1. **No assumptions or guesswork. Ever.** Always read the file, query the DB, check the logs. "It's probably X" is forbidden without tool-verified evidence.
2. **No credentials in chat.** Never ask Nyarie to paste passwords, OTPs, tokens, or service-role keys. Never put them in code, docs, or logs.
3. **KaiTrades is the only acceptance-test tenant.** Never use TC or Milkers FX as test fixtures.
4. **Never mark a feature complete without direct evidence** (screenshot, test result, log confirmation).
5. **Hard-coded tenant/user/course IDs are forbidden.** Never hard-code UUIDs.
6. **Never re-add `VERCEL_PROJECT_PRODUCTION_URL`** to `configuredPlatformHosts()`.
7. **Never redirect `/dashboard` on a custom domain to the platform.** MB-112 removed this — it must stay removed.
8. **Push to GitHub only when Nyarie explicitly says "push it" or grants permission.** The standing permission from previous sessions: "if I say you should push it then I am allowing you to push it."

---

## 11. Picking Up Immediately

The most recent unresolved issue (may or may not be fully tested yet): **MB-114 extension** (`43ab1d7`) fixed student pages redirecting to the wrong join-academy URL on custom domains. The test to confirm: visit `md415.com/academy` as a user with no TC student application — should land on the TC registration form, not a 404.

After confirming that test passes, move to the pending items in Section 6.

Good luck.
