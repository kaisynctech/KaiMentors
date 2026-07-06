# Mission Brief MB-116
## Custom-Domain Browser Tab Titles — Remove KaiMentors Suffix

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — White-label integrity; mentors and invitees see KaiMentors in browser tabs  
**Prepared by:** Enterprise Architect  
**Depends on:** MB-111 (partial fix), MB-112 (dashboard on custom domain), MB-113 (`/join/` pass-through)

---

## Mission Summary

Client-facing pages on custom domains (and platform-domain mentor flows) still show **"KaiMentors"** in the browser tab. Page body content is correctly white-labelled (PASII, Traders Confidence, etc.) but the tab title leaks the platform brand. MB-111 added title overrides for `domain-sites/` and `student/` layouts, but MB-112 and MB-113 introduced routes served **outside** those layouts. Additionally, several pages set `title` as a plain string, which Next.js still merges into the root template `"%s | KaiMentors"`.

---

## Business Objective

Students, mentors, and invitees on any client portal must never see "KaiMentors" in the browser tab. The tab should show the portal name or a portal-scoped page title only.

---

## Evidence (Product Owner screenshots, 2026-07-06)

| URL | Tab shows (wrong) | Page body (correct) |
|---|---|---|
| `passii714.com/join/workspace/...` | **KaiMentors** | Join PASII |
| `passii714.com/dashboard/settings?tab=team` | **Dashboard \| KaiMentors** | PASII workspace |
| `md415.com/login` | **Academy \| KaiMentors** | Traders Confidence |
| `md415.com/dashboard` | **Dashboard \| KaiMentors** | Traders Confidence |
| `md415.com/join/workspace/...` | **KaiMentors** | Join Traders Confidence |

---

## Root Cause

**1. Root layout applies globally:**

```typescript
// app/layout.tsx
title: {
  default: "KaiMentors",
  template: "%s | KaiMentors",
},
```

**2. MB-111 overrides only cover `domain-sites/` and `student/` subtrees.** After MB-112, `/dashboard` is served natively on custom domains from `app/dashboard/` — **not** under `domain-sites/layout.tsx`. After MB-113, `/join/workspace/[token]` is also served natively — **not** under `domain-sites/layout.tsx`.

**3. Plain string titles still inherit the root template.** In Next.js App Router, `title: "Join PASII"` becomes `"Join PASII | KaiMentors"` unless `title: { absolute: "Join PASII" }` is used. Several pages (including `domain-sites/[hostname]/login` which has **no** `generateMetadata`) fall through to layout defaults → `"Academy | KaiMentors"`.

---

## Expected Behaviour

| Context | Tab title (examples) | Must NOT contain |
|---|---|---|
| Workspace invite `/join/workspace/[token]` | `Join PASII`, `Join Traders Confidence` | KaiMentors |
| Mentor dashboard (any sub-page) | `PASII`, `Traders Confidence`, or `Overview · PASII` | KaiMentors |
| Custom-domain login `/login` | `Sign In · Traders Confidence` or `Traders Confidence` | KaiMentors |
| Platform admin `/admin/*` | `KaiMentors` or `Admin \| KaiMentors` | *(unchanged — platform only)* |
| Platform homepage `kaimentors.vercel.app/` | `KaiMentors` | *(unchanged)* |

---

## Architecture Summary

Use **`title: { absolute: "..." }`** on every client-facing page that must not inherit the root template. Do **not** change `app/layout.tsx` — platform pages legitimately use KaiMentors branding.

### Helper pattern (recommended)

Create a small helper to avoid repetition:

```typescript
// lib/metadata.ts
import type { Metadata } from "next";

export function portalTitle(label: string): Metadata {
  return { title: { absolute: label } };
}
```

Use `portalTitle("Join PASII")`, `portalTitle("Traders Confidence")`, etc.

---

## Implementation Scope

### IN scope

1. `generateMetadata` on `/join/workspace/[token]` with absolute portal-scoped title.
2. Async `generateMetadata` on `app/dashboard/layout.tsx` resolving portal name via `getMentorWorkspace()`.
3. `generateMetadata` on `app/domain-sites/[hostname]/login/page.tsx` with absolute portal-scoped title.
4. `app/join/layout.tsx` — title template override as defence-in-depth for all `/join/*` routes.
5. Sweep existing client-facing `generateMetadata` calls that use plain string `title` — convert to `{ absolute: ... }`.

### OUT of scope

- Changing root `app/layout.tsx` (platform branding preserved).
- Favicon changes.
- `kaimentors.vercel.app/admin`, `/login` (platform mentor login), `/onboarding` titles.
- Milkers FX platform-domain `km_workspace` cookie on join (separate brief if needed).

---

## Files Expected

### Create

| File | Purpose |
|---|---|
| `lib/metadata.ts` | `portalTitle()` helper returning `{ title: { absolute } }` |
| `app/join/layout.tsx` | Override title template for `/join/*` subtree |

**`app/join/layout.tsx`:**

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Workspace invitation",
    template: "%s",
  },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

### Modify

| File | Change |
|---|---|
| `app/join/workspace/[token]/page.tsx` | Add `generateMetadata` → `{ absolute: "Join {portal_name}" }` |
| `app/dashboard/layout.tsx` | Replace static metadata with async `generateMetadata` using `getMentorWorkspace()` |
| `app/domain-sites/[hostname]/login/page.tsx` | Add `generateMetadata` → `{ absolute: "Sign In · {portal_name}" }` or `{portal_name}` |
| `app/domain-sites/[hostname]/join-academy/page.tsx` | Change string title to `{ absolute: ... }` |
| `app/domain-sites/[hostname]/[[...path]]/page.tsx` | Change all string titles to `{ absolute: ... }` |
| `app/portal/[slug]/login/page.tsx` | Change string title to `{ absolute: ... }` |
| `app/portal/[slug]/join-academy/page.tsx` | Change string title to `{ absolute: ... }` |
| `app/portal/[slug]/page.tsx` | Change string title to `{ absolute: ... }` if present |
| `app/portal/[slug]/[pageSlug]/page.tsx` | Change string title to `{ absolute: ... }` if present |

### Do not modify

| File | Reason |
|---|---|
| `app/layout.tsx` | Platform root — KaiMentors branding is correct here |
| `app/admin/**` | Platform admin only |
| `components/dashboard-shell.tsx` | In-page chrome already portal-branded |

---

## Change 1 — `app/join/workspace/[token]/page.tsx`

Add `generateMetadata` (mirror join page body logic — trader lookup by `invite_token`, portal name from `portals`):

```typescript
import type { Metadata } from "next";
import { portalTitle } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return portalTitle("Workspace invitation");

  const { data: trader } = await admin
    .from("traders")
    .select("id")
    .eq("invite_token", token)
    .maybeSingle();
  if (!trader) return portalTitle("Workspace invitation");

  const { data: portalRow } = await admin
    .from("portals")
    .select("portal_name")
    .eq("trader_id", trader.id)
    .maybeSingle();

  const name = portalRow?.portal_name ?? "Workspace";
  return portalTitle(`Join ${name}`);
}
```

Works on **both** custom domain and platform domain (`kaimentors.vercel.app/join/workspace/...` for Milkers FX).

---

## Change 2 — `app/dashboard/layout.tsx`

Replace static export with async metadata from workspace context:

```typescript
import type { Metadata } from "next";
import { getMentorWorkspace } from "@/lib/workspace";
import { portalTitle } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getMentorWorkspace();
  const name = workspace?.portal?.portal_name ?? "Dashboard";
  return portalTitle(name);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

All dashboard sub-pages (`/dashboard`, `/dashboard/settings`, `/dashboard/students`, etc.) inherit this absolute title on custom domains and platform domain.

**Optional enhancement:** Individual dashboard pages may later set their own absolute titles (e.g. `Settings · PASII`) — not required for this mission.

---

## Change 3 — `app/domain-sites/[hostname]/login/page.tsx`

Add `generateMetadata` (same data load as page component):

```typescript
export async function generateMetadata({
  params,
}: CustomDomainLoginPageProps): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) return portalTitle("Sign In");
  return portalTitle(`Sign In · ${data.portal.portal_name}`);
}
```

---

## Change 4 — Sweep string titles → absolute

For every `generateMetadata` in client-facing routes listed above, replace:

```typescript
// Before — still gets "| KaiMentors" suffix
return { title: `Join ${name}` };

// After
return portalTitle(`Join ${name}`);
```

---

## Regression Risks

| Risk | Mitigation |
|---|---|
| Platform admin tab loses KaiMentors | Do not touch `app/layout.tsx` or `app/admin/**` |
| Dashboard metadata calls `getMentorWorkspace()` twice (layout + page) | Acceptable — same pattern as dashboard pages; layout metadata runs once per navigation |
| Unauthenticated `/dashboard` redirect | `getMentorWorkspace()` returns null → fallback title `"Dashboard"` (no KaiMentors) |
| Join page invalid token | Fallback `"Workspace invitation"` — no KaiMentors |

---

## Testing Requirements

Use **PASII** (`www.passii714.com`) and **Traders Confidence** (`www.md415.com`). Check browser **tab title only** (not page body).

### Test 1 — Workspace invite link
1. Open `https://www.passii714.com/join/workspace/{token}` (incognito).
2. **Pass:** Tab reads **"Join PASII"** (or similar). **Fail:** Tab contains "KaiMentors".

### Test 2 — Mentor dashboard
1. Sign in as TC or PASII owner on custom domain.
2. Visit `/dashboard` and `/dashboard/settings?tab=team`.
3. **Pass:** Tab reads **"Traders Confidence"** or **"PASII"**. **Fail:** "| KaiMentors" in tab.

### Test 3 — Custom-domain login
1. Visit `https://www.md415.com/login` (incognito).
2. **Pass:** Tab reads **"Sign In · Traders Confidence"** or **"Traders Confidence"**. **Fail:** "Academy | KaiMentors".

### Test 4 — Platform domain (Milkers FX, no custom domain)
1. Open `https://kaimentors.vercel.app/join/workspace/{milkers-token}` (incognito).
2. **Pass:** Tab reads **"Join Milkers FX"**. **Fail:** "KaiMentors" alone.

### Test 5 — Platform admin (no regression)
1. Visit `https://kaimentors.vercel.app/admin`.
2. **Pass:** Tab may contain "KaiMentors" — this is correct for platform admin.

### Test 6 — Student join-academy (regression)
1. Visit `https://www.passii714.com/join-academy` (incognito).
2. **Pass:** Tab reads **"Join PASII"**. **Fail:** "| KaiMentors".

---

## Acceptance Criteria

- [ ] No client-facing custom-domain tab title contains "KaiMentors"
- [ ] Workspace invite tab shows portal name (`Join {portal_name}`)
- [ ] Dashboard tab shows portal name on custom domain
- [ ] Login tab shows portal-scoped title on custom domain
- [ ] Milkers FX platform-domain invite tab shows "Join Milkers FX"
- [ ] Platform admin pages still show KaiMentors (no regression)
- [ ] `npm run build` passes

---

## Definition of Done

- All tests pass with screenshot evidence of tab titles (desktop)
- Product Owner confirms on PASII and TC custom domains
- Deployed to production
- No KaiMentors string in browser tab on any client portal mentor or invite flow

---

## Commit message suggestion

```
fix: MB-116 absolute portal titles on custom-domain mentor and invite pages
```
