# Mission Brief MB-111
## White-Label Audit: Remove All KaiMentors Brand References from Client-Facing Pages

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — Brand integrity for all client portals  
**Prepared by:** Enterprise Architect

---

## Audit Findings

Every instance of "KaiMentors" visible to students or mentors, confirmed by file reads and grep across the full codebase.

---

### LEAK 1 — Browser tab title on every page (highest impact)

**File:** `app/layout.tsx` lines 8–11

```typescript
title: {
  default: "KaiMentors",
  template: "%s | KaiMentors",
},
```

This is the **root layout metadata**. It applies to every page in the application — including `app/domain-sites/[hostname]/...` (the custom site pages students visit) and `app/student/...` (the student portal). Every browser tab for every PASII, TC, KaiTrades, and Milkers FX student currently reads "Page Title | KaiMentors".

There are no `layout.tsx` files in `app/domain-sites/` or `app/student/` to override it.

---

### LEAK 2 — "Powered by KaiMentors" on custom sites (all 4 portals)

**File:** `components/custom-site-renderer.tsx` lines 11–14, 47–49

```typescript
const poweredBy =
  site.assignment.show_powered_by &&
  (site.package.manifest.poweredByLabel ?? "Powered by KaiMentors");
...
{poweredBy ? (
  <Link className="kaimentors-powered-by" href="/">
    {poweredBy}
  </Link>
) : null}
```

**DB state (confirmed):** `show_powered_by: true` for all 4 portals. Every custom site shows "Powered by KaiMentors" as a clickable footer link.

---

### LEAK 3 — "Powered by KaiMentors" on website-builder pages (always shown, no flag)

**File:** `components/website/website-renderer.tsx` line 453

```typescript
<small>Powered by KaiMentors</small>
```

This is **hardcoded** — not controlled by `show_powered_by`. Portals using the website builder (rather than a custom site package) always show this.

---

### LEAK 4 — "Secure academy access powered by KaiMentors." on the login page

**File:** `components/academy-login-page.tsx` line 86

```typescript
<p className={styles.footerNote}>
  Secure academy access powered by KaiMentors.
</p>
```

Every student and mentor who visits `www.passii714.com/login`, `www.md415.com/login`, or any portal login page sees this line.

---

### LEAK 5 — "Securely managed by KaiMentors" on the not-found page

**File:** `app/domain-sites/[hostname]/not-found.tsx` line 15

```typescript
<small><ShieldCheck size={14} /> Securely managed by KaiMentors</small>
```

Visible to anyone who visits an unconfigured or inactive custom domain path.

---

### LEAK 6 — "Academy access powered by KaiMentors" on core academy pages

**File:** `components/core-academy-page.tsx` line 54

```typescript
<div className={styles.verified}><ShieldCheck size={16} /> Academy access powered by KaiMentors</div>
```

Shown on portals using the core academy delivery mode.

---

### LEAK 7 — "KaiMentors" in account setup error messages (mentor-facing)

**File:** `components/account-setup-flow.tsx` lines 131, 134, 141

- "a KaiMentors platform administrator must renew the invitation"
- "Contact KaiMentors support"
- "the password you will use when returning to KaiMentors"

Mentors see these during account setup on the platform.

---

### NOT a leak (confirmed safe)

- `components/team-manager.tsx` line 10: SSR fallback `"https://kaimentors.vercel.app"` — browser always uses `window.location.origin` (the current domain). No string reaches the end user.
- `components/dashboard-shell.tsx`: mentor mode shows `portalName ?? "Academy"`, not "KaiMentors" in the nav. ✓
- `app/login/page.tsx`: Platform login — only reached by mentors/owners using the platform URL directly. Acceptable.

---

### ARCHITECTURAL NOTE — Mentor dashboard domain (out of scope for this brief)

The mentor dashboard lives at `kaimentors.vercel.app/dashboard`. The domain name itself contains "KaiMentors". Full mentor white-labeling would require serving the dashboard on the custom domain (`www.passii714.com/dashboard`), which requires removing the middleware redirect that currently sends custom-domain `/dashboard` requests to the platform. This is a separate architectural decision and is NOT included in this brief.

---

## Fixes

### Fix 1 — Override title template for all domain-site and student pages

**Create `app/domain-sites/layout.tsx`** (new file):

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Academy",
    template: "%s",   // no "| KaiMentors" suffix for any custom domain page
  },
};

export default function DomainSitesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

**Create `app/student/layout.tsx`** (new file):

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Academy",
    template: "%s",   // no "| KaiMentors" suffix for any student portal page
  },
};

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

Both files are minimal pass-through layouts that only override the metadata title template. No DOM changes, no style changes.

---

### Fix 2 — Turn off `show_powered_by` for all client portals (DB)

```sql
UPDATE public.custom_site_assignments
SET show_powered_by = false,
    updated_at = now()
WHERE portal_id IN (
  'c3dc2338-ca9c-4e92-87c9-a0afe746f3b6',  -- KaiTrades
  '332e9aba-6438-4430-a21a-c5dd02a59c86',  -- Traders Confidence
  'b5c0e3d1-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- Milkers FX (verify portal_id below)
  'eb7f5b51-037a-446d-bfe9-3ea3481099e2'   -- PASII
);
```

**Before running, verify all four portal IDs:**

```sql
SELECT id, portal_name FROM portals
WHERE slug IN ('kaitrades','traders-confidence','milkers-fx','pasii');
```

Use the confirmed IDs in the UPDATE. This takes effect immediately, no deploy required.

---

### Fix 3 — Remove "Powered by KaiMentors" from website-builder renderer

**File:** `components/website/website-renderer.tsx`

**Find** (line ~453):
```typescript
        <small>Powered by KaiMentors</small>
```

**Replace with:** *(delete the line entirely)*

This text is hardcoded and has no flag. It must be removed.

---

### Fix 4 — Remove "Secure academy access powered by KaiMentors." from login page

**File:** `components/academy-login-page.tsx`

**Find** (line ~86):
```typescript
            <p className={styles.footerNote}>
              Secure academy access powered by KaiMentors.
            </p>
```

**Replace with:** *(delete these three lines entirely)*

---

### Fix 5 — Remove "Securely managed by KaiMentors" from not-found page

**File:** `app/domain-sites/[hostname]/not-found.tsx`

**Find** (line 15):
```typescript
        <small><ShieldCheck size={14} /> Securely managed by KaiMentors</small>
```

**Replace with:** *(delete this line entirely)*

Also remove the `ShieldCheck` import if it becomes unused after this deletion:
```typescript
import { Globe2, ShieldCheck } from "lucide-react";
```
→ change to:
```typescript
import { Globe2 } from "lucide-react";
```

---

### Fix 6 — Remove "Academy access powered by KaiMentors" from core academy page

**File:** `components/core-academy-page.tsx`

**Find** (line ~54):
```typescript
          <div className={styles.verified}><ShieldCheck size={16} /> Academy access powered by KaiMentors</div>
```

**Replace with:** *(delete this line entirely)*

Check if `ShieldCheck` is used elsewhere in the file; remove the import if not.

---

### Fix 7 — Replace KaiMentors references in account-setup error messages

**File:** `components/account-setup-flow.tsx`

**Find** (line ~131):
```
"a KaiMentors platform administrator must renew the invitation before setup can finish"
```
**Replace with:**
```
"a platform administrator must renew the invitation before setup can finish"
```

**Find** (line ~134):
```
"Contact KaiMentors support so the existing account can be reviewed"
```
**Replace with:**
```
"Contact platform support so the existing account can be reviewed"
```

**Find** (line ~141):
```
"the password you will use when returning to KaiMentors"
```
**Replace with:**
```
"the password you will use to sign in"
```

---

## What Does NOT Change

- `app/layout.tsx` — root layout stays as-is (platform pages like `/admin`, `/dashboard`, `/login`, `/onboarding` correctly keep the KaiMentors branding since those are platform-side)
- All DB schema — no structural changes
- All routing logic — no changes
- Custom site HTML/CSS content — untouched

---

## Build and Commit

Apply the DB update first (no deploy needed). Then:

```bash
npm run build
# must be zero errors

git add app/domain-sites/layout.tsx \
        app/student/layout.tsx \
        components/website/website-renderer.tsx \
        components/academy-login-page.tsx \
        "app/domain-sites/[hostname]/not-found.tsx" \
        components/core-academy-page.tsx \
        components/account-setup-flow.tsx

git commit -m "feat: remove KaiMentors brand references from all client-facing pages (white-label)"
git push origin HEAD:main
```

---

## Testing

After Vercel deployment is green:

1. **Browser tab titles** — visit `www.passii714.com` → tab must NOT say "| KaiMentors". Should say just the page title (e.g. "PASII" or whatever the site's `<title>` is).
2. **Custom site footer** — visit `www.passii714.com` → no "Powered by KaiMentors" anywhere on the page.
3. **Login page** — visit `www.passii714.com/login` → no "powered by KaiMentors" text anywhere on the page.
4. **Not-found page** — visit `www.passii714.com/nonexistent-page` → "website unavailable" message with no "KaiMentors" text.
5. **Platform pages unchanged** — visit `kaimentors.vercel.app/admin` → still shows "KaiMentors" in nav and title (no regression on platform side).

---

## Definition of Done

- Zero visible "KaiMentors" text on any student-facing page across all four custom domains
- Zero visible "KaiMentors" text on any academy login page
- Browser tab titles show page/portal name only, no "| KaiMentors" suffix
- Platform admin pages unaffected
