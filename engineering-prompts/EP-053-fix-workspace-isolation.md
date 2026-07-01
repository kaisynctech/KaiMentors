# EP-053 — Fix workspace isolation across all dashboard pages

## Problem

`getMentorWorkspace()` in `lib/workspace.ts` correctly reads the `km_workspace` cookie to
determine the active workspace. However, 11 of 13 dashboard pages bypass it entirely — they
each have their own inline `trader_members` query with `.order("created_at").limit(1)`, which
always returns the user's **first** workspace (KaiTrades) regardless of which portal they
logged in through.

Additionally, the current cookie is set client-side via `document.cookie` in `login-form.tsx`,
which can race against the redirect. It must be set server-side (httpOnly) via an API route
before the navigation happens.

## What changes

1. **`app/api/workspace/activate/route.ts`** (new) — server route that sets the httpOnly
   `km_workspace` cookie after validating membership
2. **`lib/workspace.ts`** — expand select to include `role` and `timezone` (required by
   bookings page)
3. **`components/login-form.tsx`** — replace `document.cookie` with `await fetch("/api/workspace/activate")`
4. **`components/workspace-switcher.tsx`** — replace `document.cookie` with same API call
5. **11 dashboard pages** — replace inline `trader_members` query + auth block with
   `getMentorWorkspace()`

---

## 1. New file: `app/api/workspace/activate/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { traderId } = (await request.json()) as { traderId: string };

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Confirm the user is actually a member of the requested workspace.
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("km_workspace", traderId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
```

---

## 2. Edit: `lib/workspace.ts`

Expand the membership select to include `role` and `timezone`. Replace the entire file:

```ts
import "server-only";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name, timezone)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get("km_workspace")?.value ?? null;
  const membership =
    (cookieValue ? memberships.find((m) => m.trader_id === cookieValue) : null) ??
    memberships[0];

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  const { data: portal } = await supabase
    .from("portals")
    .select("id, trader_id, slug, portal_name, is_published, custom_domain")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) return null;

  return {
    supabase,
    user: user as User,
    membership,
    portal,
    traderId: membership.trader_id,
    role: membership.role as "owner" | "mentor",
    displayName: trader?.display_name ?? "Mentor workspace",
    timezone: (trader as { display_name: string; timezone?: string } | null)?.timezone ?? "UTC",
  };
}
```

---

## 3. Edit: `components/login-form.tsx`

In the `if (membership)` block inside `if (academyContext)`, replace the cookie line with an
API call:

```ts
if (membership) {
  await fetch("/api/workspace/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: academyContext.traderId }),
  });
  window.location.href = academyContext.mentorDestination;
  return;
}
```

Remove any `document.cookie` line that may have been added by EP-051 or EP-052.

---

## 4. Edit: `components/workspace-switcher.tsx`

In the `switchTo` function, replace `document.cookie = ...` with:

```ts
async function switchTo(ws: Workspace) {
  await fetch("/api/workspace/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traderId: ws.traderId }),
  });
  setOpen(false);
  window.location.href = "/dashboard";
}
```

Mark the function `async`.

---

## 5. Dashboard pages — standard replacement pattern

Every page listed below has this block (field names in the select may vary slightly):

```ts
// ── REMOVE THIS ENTIRE BLOCK ──────────────────────────────────────────────
const supabase = await createClient();
if (!supabase) redirect("/login");

const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) redirect("/login");

const { data: membership } = await supabase
  .from("trader_members")
  .select("trader_id, ...")          // exact select varies per page
  .eq("user_id", user.id)
  .order("created_at")
  .limit(1)
  .maybeSingle();
if (!membership) redirect("/dashboard");
// ─────────────────────────────────────────────────────────────────────────

// ── REPLACE WITH ──────────────────────────────────────────────────────────
const workspace = await getMentorWorkspace();
if (!workspace) redirect("/login");
const { supabase, traderId, displayName, role, timezone } = workspace;
// ─────────────────────────────────────────────────────────────────────────
```

Then update all usages within the file:

| Old reference | New reference |
|---|---|
| `membership.trader_id` | `traderId` |
| `membership.trader_id` (as `tid` or `traderId`) | `traderId` |
| `membership.role` | `role` |
| `trader?.display_name` or `membership.trader[0].display_name` | `displayName` |
| `trader?.timezone` or `membership.trader[0].timezone` | `timezone` |
| `userLabel={trader?.display_name ?? "..."}` in DashboardShell | `userLabel={displayName}` |

Add `import { getMentorWorkspace } from "@/lib/workspace";` at the top of each file and
remove the `import { createClient } from "@/lib/supabase/server"` import **only if** it is
no longer used elsewhere in the file (most pages still use `supabase` for data queries —
`getMentorWorkspace()` returns the supabase client so the import can be removed).

### Files to update

Apply the pattern above to **all** of the following:

- `app/dashboard/page.tsx`
- `app/dashboard/students/page.tsx`
- `app/dashboard/courses/page.tsx`
- `app/dashboard/courses/[courseId]/page.tsx`
- `app/dashboard/courses/[courseId]/preview/page.tsx`
- `app/dashboard/courses/[courseId]/preview/lessons/[lessonId]/page.tsx`
- `app/dashboard/bookings/page.tsx`
- `app/dashboard/brokers/page.tsx`
- `app/dashboard/groups/page.tsx`
- `app/dashboard/live-classes/page.tsx`
- `app/dashboard/media/page.tsx`
- `app/dashboard/messages/page.tsx`

`app/dashboard/branding/page.tsx` and `app/dashboard/settings/page.tsx` already use
`getMentorWorkspace()` — do not touch them.

---

## Acceptance criteria

- [ ] Log in via `/portal/traders-confidence/login` → every dashboard page (Students, Courses,
  Bookings, etc.) shows Traders Confidence data
- [ ] Log in via `/portal/pasii/login` → every page shows PASII data (0 students is correct)
- [ ] Log in via `/portal/milkers-fx/login` → every page shows Milkers FX data
- [ ] Workspace switcher dropdown switches workspace correctly and persists across all pages
- [ ] Single-workspace users (regular mentors) are completely unaffected
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`
