# EP-069 — Mentor Dashboard: Show Portal Name Instead of KaiMentors

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Every mentor dashboard page renders `BrandMark` (in the sidebar, mobile drawer, and mobile header) without a `label` prop, so it falls back to the default `"KaiMentors"`. The mentor's own portal name should appear there instead.

`getMentorWorkspace()` already returns `portal` on every mentor page — the data is available, it just isn't being passed through.

No migration. No new components.

---

## Scope

| File | Change |
|---|---|
| `components/dashboard-shell.tsx` | Add `portalName?: string` prop; pass to all 3 `BrandMark` calls |
| `app/dashboard/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/bookings/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/community/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/courses/page.tsx` | Add `portal` to destructuring; pass `portalName` to both DashboardShell instances |
| `app/dashboard/courses/[courseId]/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/groups/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/live-classes/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/messages/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/resources/page.tsx` | Add `portal` to destructuring; pass `portalName` |
| `app/dashboard/settings/page.tsx` | `portal` already destructured; pass `portalName` to all DashboardShell instances |
| `app/dashboard/students/page.tsx` | Add `portal` to destructuring; pass `portalName` |

---

## 1 — DashboardShell: add `portalName` prop

**File:** `components/dashboard-shell.tsx`

### 1a — Add to interface

```typescript
// BEFORE:
interface DashboardShellProps {
  children: React.ReactNode;
  title: string;
  description: string;
  mode?: "trader" | "admin";
  userLabel?: string;
  activePath?: string;
  traderId?: string;
}

// AFTER:
interface DashboardShellProps {
  children: React.ReactNode;
  title: string;
  description: string;
  mode?: "trader" | "admin";
  userLabel?: string;
  activePath?: string;
  traderId?: string;
  portalName?: string;
}
```

### 1b — Destructure in component

```typescript
// BEFORE:
export function DashboardShell({
  children,
  title,
  description,
  mode = "trader",
  userLabel = "Account",
  activePath,
  traderId,
}: DashboardShellProps) {

// AFTER:
export function DashboardShell({
  children,
  title,
  description,
  mode = "trader",
  userLabel = "Account",
  activePath,
  traderId,
  portalName,
}: DashboardShellProps) {
```

### 1c — Pass label to all 3 BrandMark calls

There are three `<BrandMark>` instances: sidebar (≈line 118), mobile drawer header (≈line 155), and mobile header (≈line 188). Update all three with the same change:

```tsx
// BEFORE (all three instances):
<BrandMark href={mode === "admin" ? "/admin" : "/dashboard"} />

// AFTER (all three instances):
<BrandMark
  href={mode === "admin" ? "/admin" : "/dashboard"}
  label={mode === "admin" ? "KaiMentors" : (portalName ?? "Academy")}
/>
```

Admin mode keeps "KaiMentors" (it's the platform console). Trader mode uses the passed portal name, falling back to "Academy" if somehow absent.

---

## 2 — Dashboard pages: add `portal` + pass `portalName`

### Pattern for pages that don't yet destructure `portal`

Most pages look like:

```typescript
const { supabase, traderId, displayName } = workspace;
// or
const { supabase, traderId, displayName, user } = workspace;
```

For each of these, add `portal` to the destructuring:

```typescript
// BEFORE:
const { supabase, traderId, displayName } = workspace;

// AFTER:
const { supabase, traderId, displayName, portal } = workspace;
```

Then add `portalName` to every `<DashboardShell` call in the file:

```tsx
// BEFORE:
<DashboardShell
  activePath="/dashboard/bookings"
  description="..."
  title="Bookings"
  userLabel={displayName}
>

// AFTER:
<DashboardShell
  activePath="/dashboard/bookings"
  description="..."
  title="Bookings"
  userLabel={displayName}
  portalName={portal.portal_name}
>
```

Apply this pattern to all files listed in the scope table. The `title`, `description`, `activePath`, and `userLabel` props are unchanged — only add `portalName`.

### `app/dashboard/settings/page.tsx` — multiple DashboardShell instances

`portal` is already destructured. Add `portalName={portal.portal_name}` to **every** `<DashboardShell` call in the file — there are multiple (one per tab early-return: account, team, brokers, branding, audit-logs). Find all of them and add the prop to each.

### `app/dashboard/courses/page.tsx` — two DashboardShell instances

`courses/page.tsx` contains two DashboardShell calls (one in the media tab branch, one in the courses tab branch). Add `portalName={portal.portal_name}` to both.

---

## 3 — Commit and deploy

No migration needed.

```bash
git add -A
git commit -m "feat: EP-069 show portal name in mentor dashboard sidebar instead of KaiMentors"
git push origin main && vercel --prod
```

---

## 4 — Acceptance Criteria

Test with KaiTrades: log into the mentor dashboard.

- [ ] Sidebar `BrandMark` shows "KaiTrades" (not "KaiMentors") on all dashboard pages: Overview, Students, Groups, Messages, Community, Courses, Resources, Live Classes, Bookings, Settings
- [ ] Mobile drawer header shows "KaiTrades"
- [ ] Mobile header shows "KaiTrades"
- [ ] "K" initial (first letter avatar) still renders — it now reflects the portal initial ("K" for KaiTrades, "T" for Traders Confidence, etc.)
- [ ] Admin console pages (`/admin/*`) still show "KaiMentors" in BrandMark — unchanged
- [ ] TypeScript compiles clean
- [ ] No TypeScript errors from the new optional `portalName` prop
