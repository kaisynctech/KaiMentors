# EP-079 — Remove Workspace Switcher, Enforce Portal-Bound Sessions

## Architecture decision

Each workspace is a completely isolated silo. A session is bound to exactly one
workspace — the one whose portal was used to log in. There is no switching
between workspaces from within the dashboard. To access a different workspace,
the user goes to that workspace's portal and logs in there.

This is the correct model. The `WorkspaceSwitcher` component contradicts it:
it fetches every workspace the authenticated user belongs to and lets them jump
between workspaces in a single session. For `kaisynctech@gmail.com`, who is
owner of all four workspaces, this means the dashboard freely crosses workspace
boundaries — and explains why invitations made in Traders Confidence appeared
under KaiTrades (the `km_workspace` cookie was pointing at the wrong workspace).

**Removing the switcher eliminates cross-workspace contamination at its source.**

## Access model (definitive)

| Actor | How to access TC | How to access Milkers FX |
|---|---|---|
| `kaisynctech@gmail.com` (system owner) | Log in at TC portal | Log in at Milkers FX portal |
| Bongani (TC lead mentor) | Log in at TC portal | Cannot access — not a member |
| Any invited TC mentor | Log in at TC portal | Cannot access — not a member |

The system owner's `trader_members` rows for all four workspaces are correct
and should remain. They enable portal-specific login to each workspace. They do
NOT mean all workspaces should be visible simultaneously in one session.

---

## File changes

### `components/dashboard-shell.tsx`

Replace the two `<WorkspaceSwitcher />` calls (sidebar + mobile drawer) with a
static workspace block that shows the current workspace name.

**Remove this import (line 27):**
```typescript
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
```

**Replace both occurrences of `<WorkspaceSwitcher />` with:**
```tsx
<div className={styles.workspace}>
  <span>Workspace</span>
  <strong>{portalName ?? userLabel ?? "Academy"}</strong>
</div>
```

There are two occurrences — one in the sidebar `<aside>` (around line 138) and
one in the mobile drawer `<aside>` (around line 187). Replace both.

The `styles.workspace` class already exists and is used for the admin mode block
directly above (lines 133–136) — no new CSS required.

**Full diff context for the sidebar block (replace):**
```tsx
// BEFORE
{mode === "admin" ? (
  <div className={styles.workspace}>
    <span>Platform console</span>
    <strong>{userLabel}</strong>
  </div>
) : (
  <WorkspaceSwitcher />
)}

// AFTER
{mode === "admin" ? (
  <div className={styles.workspace}>
    <span>Platform console</span>
    <strong>{userLabel}</strong>
  </div>
) : (
  <div className={styles.workspace}>
    <span>Workspace</span>
    <strong>{portalName ?? userLabel ?? "Academy"}</strong>
  </div>
)}
```

Apply the same replacement in the mobile drawer block.

---

### `components/workspace-switcher.tsx`

**Delete this file entirely.** It is no longer used anywhere.

---

### `components/workspace-switcher.module.css`

**Delete this file entirely.** It is no longer used anywhere.

---

## What does NOT change

- `app/api/workspace/list/route.ts` — leave in place. It is not harmful and
  removing it is out of scope for this EP.
- `app/api/workspace/activate/route.ts` — unchanged. Still used by the portal
  login flow to set the `km_workspace` cookie on sign-in.
- `lib/workspace.ts` / `getMentorWorkspace()` — unchanged. Cookie-based
  workspace resolution is correct and remains.
- `km_workspace` cookie — unchanged. Set at portal login, persists for 30 days.
  Determines which workspace the dashboard shows.
- All portal login pages — unchanged.
- All route handlers — unchanged.

---

## Why invites were appearing in the wrong workspace

When `kaisynctech@gmail.com` used the workspace switcher to move from Traders
Confidence to KaiTrades, the `km_workspace` cookie changed to KaiTrades'
`trader_id`. Any invite made from the Settings → Team page after that switch
was submitted with the KaiTrades workspace context (because the `traderId` in
the request body came from the `km_workspace`-bound UI state).

EP-074 fixed the server-side scoping (the route validates the requesting user
is owner of the submitted `traderId`). EP-079 removes the switcher so the
cookie never changes mid-session — the workspace context is fixed at login and
cannot drift.

---

## Verification after deploy

1. Log in at `/portal/traders-confidence/login` as `kaisynctech@gmail.com`.
   - Dashboard sidebar must show "Workspace / Traders Confidence" — no dropdown.
   - No switcher, no chevron, no list of other workspaces.
2. Navigate to Settings → Team. Invite an email. Confirm the invite row appears
   under Traders Confidence only.
3. Open a new tab. Log in at `/portal/milkers-fx/login` as
   `kaisynctech@gmail.com`. Dashboard sidebar must show "Workspace / Milkers FX".
4. Confirm no overlap: TC invitations are not visible from the Milkers FX
   session and vice versa.
5. Log in at `/portal/traders-confidence/login` as Bongani's email. Confirm he
   sees TC workspace only and has no access to other portals.
