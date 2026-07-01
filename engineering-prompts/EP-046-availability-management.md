# EP-046 — Booking System: Availability Management

**Status:** Ready for Engineering — implement after EP-045 is verified  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Weekly availability windows + date overrides API + mentor availability UI tab  
**Migration required:** No (tables created in EP-045)  
**API changes:** Yes  
**Package install required:** No

---

## Context

Mentors define when they are available for bookings. This EP builds two things: recurring weekly windows (e.g. "Every Monday and Wednesday, 10am–6pm") and one-off date overrides (open an extra day, or block a day they'd normally be available). All times are stored as `time` (no timezone) and interpreted in the mentor's timezone (`traders.timezone`).

---

## Change 1 — API: Weekly availability windows

### GET + POST /api/bookings/availability

**New file:** `app/api/bookings/availability/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/), // "HH:MM"
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
}).refine(d => d.startTime < d.endTime, { message: "End time must be after start time." });

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  return membership ? { user, tid: membership.trader_id } : null;
}

export async function GET() {
  const supabase = await createClient();
  const ctx = await getMembership(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data } = await supabase!
    .from("mentor_availability")
    .select("id,day_of_week,start_time,end_time,is_active")
    .eq("trader_id", ctx.tid)
    .order("day_of_week").order("start_time");

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const ctx = await getMembership(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mentor_availability")
    .insert({
      trader_id: ctx.tid,
      day_of_week: parsed.data.dayOfWeek,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
    })
    .select("id").single();

  if (error) return NextResponse.json({ error: "Could not save availability." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

### PATCH + DELETE /api/bookings/availability/[windowId]

**New file:** `app/api/bookings/availability/[windowId]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ windowId: z.string().uuid() });
const patchSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ windowId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.startTime !== undefined) patch.start_time = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) patch.end_time = parsed.data.endTime;
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;

  const { error } = await supabase
    .from("mentor_availability").update(patch)
    .eq("id", params.data.windowId).eq("trader_id", membership.trader_id);
  if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ windowId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await supabase
    .from("mentor_availability").delete()
    .eq("id", params.data.windowId).eq("trader_id", membership.trader_id);
  if (error) return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  return NextResponse.json({ deleted: params.data.windowId });
}
```

---

## Change 2 — API: Date overrides

### GET + POST /api/bookings/availability/overrides

**New file:** `app/api/bookings/availability/overrides/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.discriminatedUnion("isBlocked", [
  z.object({
    isBlocked: z.literal(true),
    overrideDate: z.string().date(),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    isBlocked: z.literal(false),
    overrideDate: z.string().date(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().trim().max(200).optional(),
  }).refine(d => d.startTime < d.endTime, { message: "End time must be after start time." }),
]);

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("availability_overrides")
    .select("id,override_date,start_time,end_time,is_blocked,reason")
    .eq("trader_id", membership.trader_id)
    .gte("override_date", from)
    .lte("override_date", to)
    .order("override_date");

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const d = parsed.data;
  const { data, error } = await supabase
    .from("availability_overrides")
    .insert({
      trader_id: membership.trader_id,
      override_date: d.overrideDate,
      is_blocked: d.isBlocked,
      start_time: d.isBlocked ? null : d.startTime,
      end_time: d.isBlocked ? null : d.endTime,
      reason: d.reason ?? null,
    })
    .select("id").single();

  if (error) return NextResponse.json({ error: "Could not save override." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

### DELETE /api/bookings/availability/overrides/[overrideId]

**New file:** `app/api/bookings/availability/overrides/[overrideId]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ overrideId: string }> }) {
  const params = z.object({ overrideId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await supabase
    .from("availability_overrides").delete()
    .eq("id", params.data.overrideId).eq("trader_id", membership.trader_id);
  if (error) return NextResponse.json({ error: "Could not delete override." }, { status: 500 });
  return NextResponse.json({ deleted: params.data.overrideId });
}
```

---

## Change 3 — Availability tab on the Bookings page

**File:** `app/dashboard/bookings/page.tsx`

Update to fetch availability data and pass it to the component. Add `windows` and `overrides` to the existing Promise.all:

```typescript
const [
  { data: sessionTypes },
  { data: windows },
  { data: overrides },
] = await Promise.all([
  supabase
    .from("booking_session_types")
    .select("id,name,description,duration_minutes,max_participants,buffer_minutes,requires_approval,advance_booking_days,min_notice_hours,cancellation_hours,zoom_meeting_id,is_active,sort_order")
    .eq("trader_id", membership.trader_id)
    .order("sort_order").order("created_at"),
  supabase
    .from("mentor_availability")
    .select("id,day_of_week,start_time,end_time,is_active")
    .eq("trader_id", membership.trader_id)
    .order("day_of_week").order("start_time"),
  supabase
    .from("availability_overrides")
    .select("id,override_date,start_time,end_time,is_blocked,reason")
    .eq("trader_id", membership.trader_id)
    .gte("override_date", new Date().toISOString().slice(0, 10))
    .order("override_date")
    .limit(60),
]);
```

Pass `windows` and `overrides` props to the manager component. Add a tab switcher (`Session types` | `Availability`) at the top of `BookingSessionTypeManager`.

---

## Change 4 — Availability UI (add to BookingSessionTypeManager)

Add an `AvailabilityTab` section to the `BookingSessionTypeManager` component, shown when the `Availability` tab is active.

### Weekly schedule sub-section

Display a visual weekly grid — rows for each day of the week (Mon–Sun), columns showing any saved windows. For each day:
- Show existing windows as chips (e.g. "10:00–18:00") with a delete (×) button
- "+ Add window" opens a small inline form: start time picker, end time picker, Save button
- Toggling a window's `is_active` dims it but keeps it saved

### Date overrides sub-section

Below the weekly grid, show a list of upcoming overrides sorted by date. Each row shows the date, whether it's a block or extra window, and a delete button. A form to add a new override:

```
Type:     radio — "Block this date" | "Open extra hours"
Date:     date input
If open:  Start time + End time
Reason:   text input, optional
```

### Mentor timezone notice

Show a subtle info banner: "Your availability times are in [timezone] — students see them in their local timezone automatically."

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-046: availability windows + date overrides"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only.

1. Availability tab appears on `/dashboard/bookings`
2. Add a weekly window (e.g. Monday 09:00–17:00) → appears in the Monday row
3. Add a second window for the same day (e.g. Monday 18:00–20:00) → both show
4. Delete a window → removed immediately
5. Block a date → appears in overrides list with a red "Blocked" badge
6. Add extra hours on a date → appears with a green "Extra hours" badge
7. Delete an override → removed
8. Timezone notice shows the mentor's timezone from `traders.timezone`
