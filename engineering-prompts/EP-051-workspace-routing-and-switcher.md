# EP-051 — Workspace routing and switcher

## Background

`kaisynctech@gmail.com` is now the owner of four workspaces: KaiTrades, Traders Confidence,
Milkers FX, and PASII. When this user logs in via a portal-specific login page (e.g. the
Traders Confidence custom site), the dashboard must load that specific workspace — not
whichever one the database returns first. A workspace switcher in the sidebar lets the user
move between workspaces without logging out.

---

## How it works

### Active workspace cookie

A cookie named `km_workspace` (value: `trader_id` UUID) tracks which workspace is active.

- Set client-side (`document.cookie`) when a mentor authenticates via a portal login page
- Read server-side via Next.js `cookies()` in `getMentorWorkspace()`
- If the cookie is absent or holds a `trader_id` the user is not a member of → fall back to
  the earliest membership by `created_at` (current behaviour — fully backwards-compatible)

Cookie spec: `path=/; max-age=2592000; SameSite=Lax` (30 days, no `Secure` flag in dev,
add `Secure` in production via env check).

### Workspace switcher

`WorkspaceSwitcher` is a `"use client"` component rendered inside `DashboardShell`. On mount
it calls `GET /api/workspace/list` to fetch the authenticated user's workspaces. If the user
has only one workspace it renders nothing. If multiple, it renders a labelled dropdown in the
sidebar; selecting a workspace sets the cookie and navigates to `/dashboard`.

---

## Files to create

### `app/api/workspace/list/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ workspaces: [] });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ workspaces: [] }, { status: 401 });

  const { data } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at");

  const workspaces = (data ?? []).map((m) => ({
    traderId: m.trader_id,
    role: m.role,
    displayName: Array.isArray(m.trader)
      ? m.trader[0]?.display_name ?? "Workspace"
      : (m.trader as { display_name: string } | null)?.display_name ?? "Workspace",
  }));

  return NextResponse.json({ workspaces });
}
```

### `components/workspace-switcher.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./workspace-switcher.module.css";

interface Workspace {
  traderId: string;
  role: string;
  displayName: string;
}

function getActiveWorkspaceId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)km_workspace=([^;]+)/);
  return match ? match[1] : null;
}

function setActiveWorkspaceId(traderId: string) {
  document.cookie = `km_workspace=${traderId}; path=/; max-age=2592000; SameSite=Lax`;
}

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActiveId(getActiveWorkspaceId());
    fetch("/api/workspace/list")
      .then((r) => r.json())
      .then(({ workspaces: ws }) => setWorkspaces(ws ?? []));
  }, []);

  if (workspaces.length < 2) return null;

  const active = workspaces.find((w) => w.traderId === activeId) ?? workspaces[0];

  function switchTo(ws: Workspace) {
    setActiveWorkspaceId(ws.traderId);
    setOpen(false);
    window.location.href = "/dashboard";
  }

  return (
    <div className={styles.switcher}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.label}>
          <span className={styles.meta}>Workspace</span>
          <strong>{active.displayName}</strong>
        </span>
        <ChevronDown size={14} className={open ? styles.chevronOpen : undefined} />
      </button>

      {open && (
        <ul className={styles.dropdown} role="listbox">
          {workspaces.map((ws) => (
            <li key={ws.traderId} role="option" aria-selected={ws.traderId === active.traderId}>
              <button
                className={ws.traderId === active.traderId ? styles.activeOption : undefined}
                onClick={() => switchTo(ws)}
                type="button"
              >
                {ws.displayName}
                <span>{ws.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### `components/workspace-switcher.module.css`

```css
.switcher {
  position: relative;
  width: 100%;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  gap: 0.5rem;
  text-align: left;
}

.trigger:hover {
  background: var(--surface-hover);
}

.label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.meta {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.trigger strong {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevronOpen {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  z-index: 50;
  padding: 0.25rem;
  list-style: none;
  margin: 0;
}

.dropdown li button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-xs);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  background: transparent;
  border: none;
  text-align: left;
}

.dropdown li button:hover {
  background: var(--surface-hover);
}

.dropdown li button span {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: capitalize;
}

.activeOption {
  background: var(--surface-active) !important;
  color: var(--accent) !important;
}
```

---

## Files to modify

### `lib/workspace.ts`

Replace the current `getMentorWorkspace` with a version that reads the `km_workspace` cookie:

```ts
import "server-only";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) return null;

  // Resolve active workspace from cookie, falling back to earliest membership.
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get("km_workspace")?.value ?? null;
  const membership =
    (cookieValue ? memberships.find((m) => m.trader_id === cookieValue) : null)
    ?? memberships[0];

  const { data: portal } = await supabase
    .from("portals")
    .select("id,trader_id,slug,portal_name,is_published,custom_domain")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) return null;

  return {
    supabase,
    user: user as User,
    membership,
    portal,
    traderId: membership.trader_id,
  };
}
```

### `components/login-form.tsx`

In the `signIn` function, after confirming the mentor has a membership in `academyContext.traderId`
(line 64 — the `if (membership)` block), set the workspace cookie **before** the redirect:

```ts
if (membership) {
  // NEW: stamp the portal's workspace as active before navigating
  document.cookie = `km_workspace=${academyContext.traderId}; path=/; max-age=2592000; SameSite=Lax`;
  window.location.href = academyContext.mentorDestination;
  return;
}
```

No other changes to this file.

### `components/dashboard-shell.tsx`

1. Add `import { WorkspaceSwitcher } from "@/components/workspace-switcher";` with the other imports.

2. In the sidebar `<nav>` block (both desktop and mobile), replace the current workspace `<div>` block:

```tsx
// BEFORE
<div className={styles.workspace}>
  <span>{mode === "admin" ? "Platform console" : "Mentor workspace"}</span>
  <strong>{userLabel}</strong>
</div>
```

```tsx
// AFTER
{mode === "admin" ? (
  <div className={styles.workspace}>
    <span>Platform console</span>
    <strong>{userLabel}</strong>
  </div>
) : (
  <WorkspaceSwitcher />
)}
```

Apply the same replacement in **both** the desktop `<aside>` and the mobile drawer `<aside>`.

---

## Acceptance criteria

- [ ] Log in via `/portal/pasii/login` → dashboard loads PASII workspace, PASII shown in sidebar
- [ ] Log in via `/portal/traders-confidence/login` → dashboard loads Traders Confidence, shown in sidebar
- [ ] Log in via `/portal/kaitrades/login` → dashboard loads KaiTrades
- [ ] Log in via `/login` (platform login) → dashboard defaults to earliest workspace (KaiTrades)
- [ ] Sidebar workspace switcher shows all 4 workspaces
- [ ] Switching workspace in sidebar → dashboard reloads with selected workspace
- [ ] Single-workspace accounts: switcher renders nothing, sidebar shows workspace name as before
- [ ] `npx tsc --noEmit` passes with zero errors

## Notes

- PASII and other portals must have `is_published = true` in `portals` before their login
  pages are accessible (the portal slug lookup filters by `is_published`). Publish via
  Dashboard → Academy Page when ready.
- Do not use the Write tool on any existing file — use Edit only.
