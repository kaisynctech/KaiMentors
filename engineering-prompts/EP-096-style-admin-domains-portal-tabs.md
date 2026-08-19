# EP-096 — Style Portal Selector Tabs on Admin Domains Page

## Problem

`app/admin/domains/page.tsx` renders the portal selector as bare `<Link>`
elements inside an unstyled `<nav>`. The links run together with no spacing,
no active indicator, and no visual affordance — they are almost invisible and
barely clickable. The selected portal is not distinguishable from the others.

## Changes

### New file — `app/admin/domains/page.module.css`

```css
.portalNav {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.portalTab {
  border-bottom: 2px solid transparent;
  padding: 0 16px 13px;
  color: #697177;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  text-decoration: none;
}

.portalTab:hover {
  color: #111315;
}

.portalTabActive {
  border-bottom: 2px solid #111315;
  padding: 0 16px 13px;
  color: #111315;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  text-decoration: none;
}
```

### Updated file — `app/admin/domains/page.tsx`

**Replace:**

```tsx
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { WebsiteDomainManager } from "@/components/website-domain-manager";
import { requirePlatformAdmin } from "@/lib/admin-access";
import type { WebsiteDomain } from "@/lib/domains/types";
```

**With:**

```tsx
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { WebsiteDomainManager } from "@/components/website-domain-manager";
import { requirePlatformAdmin } from "@/lib/admin-access";
import type { WebsiteDomain } from "@/lib/domains/types";
import styles from "./page.module.css";
```

**Replace:**

```tsx
      <nav aria-label="Academy selection">
        {(portals ?? []).map((portal) => <Link href={`/admin/domains?portal=${portal.id}`} key={portal.id}>{portal.portal_name}</Link>)}
      </nav>
```

**With:**

```tsx
      <nav aria-label="Academy selection" className={styles.portalNav}>
        {(portals ?? []).map((portal) => (
          <Link
            className={portal.id === selected?.id ? styles.portalTabActive : styles.portalTab}
            href={`/admin/domains?portal=${portal.id}`}
            key={portal.id}
          >
            {portal.portal_name}
          </Link>
        ))}
      </nav>
```

## What changes

- Tabs are spaced, readable, and use the same visual language as the
  Custom domains / Release history tabs inside the domain manager.
- The active portal has a solid `#111315` bottom border and dark text.
- Inactive portals are muted (`#697177`) and highlight on hover.
- No logic changes — purely presentational.

## Deployment

Two files: one new CSS module, one updated page. No migration required.

## Verification

Visit `kaimentors.vercel.app/admin/domains`. The portal names should appear
as clearly separated tabs with an underline on the active one. Clicking each
tab should update the underline to the newly selected portal.
