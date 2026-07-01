# EP-043 — Live Classes: Mentor Dashboard + CRUD

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Schema migration + mentor dashboard page + CRUD API  
**Migration required:** Yes  
**API changes:** Yes — new live-classes endpoints  
**Package install required:** No

---

## Context

The `live_classes` table already exists and is fully RLS-protected. The student-facing page at `app/student/live-classes/page.tsx` already reads and renders published classes. What's missing is the mentor side entirely — no dashboard page, no API, no way to create or manage sessions.

This EP delivers the management layer. EP-044 (next) adds the Zoom embedded session experience. Both EPs are required for the full feature.

The design supports two provider modes:
- **Zoom (embedded):** mentor provides a Meeting ID + Passcode. Students join inside KaiMentors via the Zoom SDK — the raw credentials are never exposed. EP-044 implements the embedded room.
- **Other providers (fallback link):** mentor provides a join URL (Google Meet, Teams, etc.). Verified students see a "Join" button inside KaiMentors that opens the URL. This is gated — students must be logged in and verified to see it. No public URL is ever displayed.

---

## Change 1 — Database migration

Run this migration. All new columns are nullable or have defaults so existing rows are unaffected.

```sql
ALTER TABLE public.live_classes
  ALTER COLUMN join_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS meeting_id       text,
  ADD COLUMN IF NOT EXISTS meeting_passcode text,
  ADD COLUMN IF NOT EXISTS room_status      text NOT NULL DEFAULT 'scheduled'
    CHECK (room_status IN ('scheduled', 'live', 'ended')),
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url    text;
```

**Column guide:**
- `join_url` — now nullable; used for non-Zoom providers
- `meeting_id` — Zoom meeting number (e.g. `"123 456 7890"` or `"1234567890"`)
- `meeting_passcode` — Zoom meeting passcode; never returned to the client in API responses
- `room_status` — lifecycle state: `scheduled` → `live` → `ended`
- `recording_enabled` — per-class toggle; when true, mentor is reminded to enable recording in Zoom
- `recording_url` — mentor pastes the recording URL after the session ends

---

## Change 2 — API: POST /api/live-classes

**New file:** `app/api/live-classes/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  provider: z.enum(["zoom", "google_meet", "teams", "other"]),
  meetingId: z.string().trim().max(50).nullable().optional(),
  meetingPasscode: z.string().trim().max(50).nullable().optional(),
  joinUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  recordingEnabled: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.provider === "zoom" && !val.meetingId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Meeting ID is required for Zoom.", path: ["meetingId"] });
  }
  if (val.provider !== "zoom" && !val.joinUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Join URL is required.", path: ["joinUrl"] });
  }
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 403 });

  const d = parsed.data;
  const { data, error } = await supabase
    .from("live_classes")
    .insert({
      trader_id: membership.trader_id,
      created_by: user.id,
      title: d.title,
      description: d.description ?? null,
      provider: d.provider,
      meeting_id: d.meetingId ?? null,
      meeting_passcode: d.meetingPasscode ?? null,
      join_url: d.joinUrl ?? null,
      starts_at: d.startsAt,
      ends_at: d.endsAt ?? null,
      recording_enabled: d.recordingEnabled ?? false,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not create class." }, { status: 500 });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

---

## Change 3 — API: PATCH + DELETE /api/live-classes/[classId]

**New file:** `app/api/live-classes/[classId]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ classId: z.string().uuid() });

const patchSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  provider: z.enum(["zoom", "google_meet", "teams", "other"]).optional(),
  meetingId: z.string().trim().max(50).nullable().optional(),
  meetingPasscode: z.string().trim().max(50).nullable().optional(),
  joinUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  roomStatus: z.enum(["scheduled", "live", "ended"]).optional(),
  recordingEnabled: z.boolean().optional(),
  recordingUrl: z.string().url().nullable().optional(),
});

async function resolveContext(context: { params: Promise<{ classId: string }> }) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return null;
  return { supabase, tid: membership.trader_id, classId: params.data.classId };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ classId: string }> },
) {
  const ctx = await resolveContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const d = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.title !== undefined) patch.title = d.title;
  if (d.description !== undefined) patch.description = d.description;
  if (d.provider !== undefined) patch.provider = d.provider;
  if (d.meetingId !== undefined) patch.meeting_id = d.meetingId;
  if (d.meetingPasscode !== undefined) patch.meeting_passcode = d.meetingPasscode;
  if (d.joinUrl !== undefined) patch.join_url = d.joinUrl;
  if (d.startsAt !== undefined) patch.starts_at = d.startsAt;
  if (d.endsAt !== undefined) patch.ends_at = d.endsAt;
  if (d.status !== undefined) patch.status = d.status;
  if (d.roomStatus !== undefined) patch.room_status = d.roomStatus;
  if (d.recordingEnabled !== undefined) patch.recording_enabled = d.recordingEnabled;
  if (d.recordingUrl !== undefined) patch.recording_url = d.recordingUrl;

  const { error } = await ctx.supabase
    .from("live_classes")
    .update(patch)
    .eq("id", ctx.classId)
    .eq("trader_id", ctx.tid);

  if (error) return NextResponse.json({ error: "Could not update class." }, { status: 500 });

  return NextResponse.json({ updated: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ classId: string }> },
) {
  const ctx = await resolveContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await ctx.supabase
    .from("live_classes")
    .delete()
    .eq("id", ctx.classId)
    .eq("trader_id", ctx.tid);

  if (error) return NextResponse.json({ error: "Could not delete class." }, { status: 500 });

  return NextResponse.json({ deleted: ctx.classId });
}
```

---

## Change 4 — Mentor dashboard page

**New file:** `app/dashboard/live-classes/page.tsx`

```typescript
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveClassManager } from "@/components/live-class-manager";
import { createClient } from "@/lib/supabase/server";

export default async function LiveClassesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: classes } = await supabase
    .from("live_classes")
    .select("id,title,description,provider,meeting_id,join_url,starts_at,ends_at,status,room_status,recording_enabled,recording_url")
    .eq("trader_id", membership.trader_id)
    .order("starts_at", { ascending: false });

  const trader = Array.isArray(membership.trader) ? membership.trader[0] : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/live-classes"
      description="Schedule and manage live sessions for your students."
      title="Live Classes"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <LiveClassManager classes={classes ?? []} />
    </DashboardShell>
  );
}
```

**Important:** `meeting_passcode` is deliberately excluded from the select — it is never sent to the client.

---

## Change 5 — LiveClassManager component

**New file:** `components/live-class-manager.tsx`

This is a `"use client"` component. Implement with the following behaviour:

### Data types

```typescript
type ClassStatus = "draft" | "published" | "archived";
type RoomStatus = "scheduled" | "live" | "ended";
type Provider = "zoom" | "google_meet" | "teams" | "other";

interface LiveClass {
  id: string;
  title: string;
  description: string | null;
  provider: Provider;
  meeting_id: string | null;
  join_url: string | null;
  starts_at: string;
  ends_at: string | null;
  status: ClassStatus;
  room_status: RoomStatus;
  recording_enabled: boolean;
  recording_url: string | null;
}
```

### Layout

Two-panel layout matching the rest of the dashboard:

**Left panel — class list**
- Header with "Schedule class" button (opens the form panel)
- List of all classes sorted by `starts_at` descending
- Each row shows: title, provider badge, date/time, status badge (`draft` / `published`), room status badge (`live` in red when `room_status === "live"`)
- Clicking a row selects it and opens the detail/edit panel on the right

**Right panel — create / edit form**
- When nothing selected: empty state with "Schedule a class" prompt
- When creating or editing: form with the following fields

### Form fields

```
Title *               text input, max 120
Description           textarea, max 600, optional
Provider *            select: Zoom | Google Meet | Microsoft Teams | Other
--- conditional on provider ---
  If Zoom:
    Meeting ID *      text input (numbers only, e.g. 123 456 7890)
    Passcode          text input (optional but recommended)
    Recording         toggle — "Record this session" (reminder text: "Enable cloud recording in your Zoom settings for this meeting")
  If other:
    Join URL *        url input
--- end conditional ---
Start date/time *     datetime-local input
End time              time input, optional
Status                toggle: Draft / Published
```

### Actions on an existing class

- **Save changes** — PATCH /api/live-classes/[classId]
- **Publish / Unpublish** — PATCH status field
- **Delete** — DELETE with confirmation dialog: "Delete [title]? This cannot be undone."
- **Start session** (only shown when `status === "published"` and `room_status === "scheduled"`) — PATCH `room_status: "live"`, then `router.push("/dashboard/live-classes/[classId]/host")` — EP-044 implements this page; for now the button can be present but the destination page won't exist yet
- **End session** (only shown when `room_status === "live"`) — PATCH `room_status: "ended"`
- **Add recording URL** (only shown when `room_status === "ended"` and `recording_enabled`) — inline text input to paste and save `recording_url`

### Provider badge colours
- Zoom: blue (#0B5CFF)
- Google Meet: green (#1E8E3E)
- Teams: purple (#6264A7)
- Other: grey

### Status badges
- `draft`: grey
- `published`: green
- `live`: red, pulsing dot

### Date formatting
Show as: "Mon 29 Jun · 14:00 – 15:30" (use `toLocaleDateString` / `toLocaleTimeString`)

---

## Change 6 — CSS

**New file:** `components/live-class-manager.module.css`

Match the existing dashboard panel pattern used in `course-detail-manager.module.css` — two-column layout, left list panel, right detail panel, modal overlay for delete confirmation. Reuse the same spacing/colour variables.

Add a `.liveDot` rule for the pulsing red indicator on live sessions:
```css
.liveDot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d93025;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.4); }
}
```

---

## Change 7 — Update student live classes page

**File:** `app/student/live-classes/page.tsx`

The existing page renders a "Join" anchor tag pointing to `cls.join_url` directly. Update it as follows:

For classes where `provider === "zoom"` and `meeting_id` is set, the Join button should link to `/student/live-classes/[cls.id]` (the embedded room page that EP-044 will create). Do not show the raw URL to students.

For classes where `provider !== "zoom"` (fallback), the Join button should open `cls.join_url` in a new tab — but only if the student is verified. This is already the case (the page gates on `isVerified`). No change needed for the fallback path.

Change the join button logic inside the `upcoming.map()`:
```tsx
{cls.provider === "zoom" && cls.meeting_id ? (
  <a
    className={styles.joinBtn}
    href={`/student/live-classes/${cls.id}`}
  >
    <Video size={14} />
    Join
  </a>
) : cls.join_url ? (
  <a
    className={styles.joinBtn}
    href={cls.join_url}
    rel="noreferrer"
    target="_blank"
  >
    <Video size={14} />
    Join
    <ExternalLink size={12} />
  </a>
) : null}
```

Also update the select query to include `provider` and `meeting_id`:
```typescript
.select("id,title,description,provider,meeting_id,join_url,starts_at,ends_at")
```

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-043: live classes mentor dashboard + CRUD API"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only.

1. `/dashboard/live-classes` loads with the two-panel layout and "Schedule class" button
2. Create a Zoom class — Meeting ID + Passcode fields appear; saving creates the record; `meeting_passcode` does NOT appear in any network response
3. Create a Google Meet class — Join URL field appears; saving creates the record
4. Edit a class — all fields update correctly
5. Publish / unpublish toggles status between `draft` and `published`
6. Delete a class — confirmation dialog appears; on confirm the class is removed
7. "Start session" button appears on published classes with `room_status = scheduled`; clicking patches `room_status` to `live` and shows the live badge
8. "End session" appears while `room_status = live`; clicking patches to `ended`
9. "Add recording URL" input appears after session ends with recording enabled
10. Student live classes page: Zoom classes show a link to `/student/live-classes/[id]` (page not yet built — 404 is expected until EP-044); non-Zoom classes show the external join button as before
