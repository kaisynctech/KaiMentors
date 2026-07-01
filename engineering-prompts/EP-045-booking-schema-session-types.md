# EP-045 — Booking System: Schema + Session Types

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Full booking schema migration + session types CRUD API + mentor session types UI  
**Migration required:** Yes — 4 new tables, 1 new enum  
**API changes:** Yes  
**Package install required:** No

---

## Context

This is the foundation EP for the full booking system. All subsequent EPs (046–048) depend on this schema being in place. Implement in full before starting EP-046.

The booking system allows students to book one-on-one or small-group sessions with their mentor. Mentors define session types (e.g. "Strategy Review — 60 min"), set their weekly availability, and students pick slots. Sessions auto-create Live Class entries so both parties join through KaiMentors.

---

## Change 1 — Database migration

```sql
-- Booking status enum
CREATE TYPE booking_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

-- Session types defined by the mentor
CREATE TABLE public.booking_session_types (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id             uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description           text        CHECK (char_length(description) <= 500),
  duration_minutes      int         NOT NULL CHECK (duration_minutes IN (15,30,45,60,90,120)),
  max_participants      int         NOT NULL DEFAULT 1 CHECK (max_participants BETWEEN 1 AND 50),
  buffer_minutes        int         NOT NULL DEFAULT 0 CHECK (buffer_minutes IN (0,5,10,15,30)),
  requires_approval     boolean     NOT NULL DEFAULT false,
  advance_booking_days  int         NOT NULL DEFAULT 14 CHECK (advance_booking_days BETWEEN 1 AND 60),
  min_notice_hours      int         NOT NULL DEFAULT 24 CHECK (min_notice_hours BETWEEN 1 AND 72),
  cancellation_hours    int         NOT NULL DEFAULT 12 CHECK (cancellation_hours BETWEEN 0 AND 48),
  zoom_meeting_id       text,
  zoom_passcode         text,
  is_active             boolean     NOT NULL DEFAULT true,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Recurring weekly availability windows (times in mentor's timezone, stored as time)
CREATE TABLE public.mentor_availability (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id     uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  day_of_week   smallint    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon … 6=Sat
  start_time    time        NOT NULL,
  end_time      time        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_window CHECK (end_time > start_time)
);

-- One-off date additions or blocks
CREATE TABLE public.availability_overrides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id       uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  override_date   date        NOT NULL,
  start_time      time,       -- null when is_blocked = true
  end_time        time,       -- null when is_blocked = true
  is_blocked      boolean     NOT NULL DEFAULT false,
  reason          text        CHECK (char_length(reason) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_override CHECK (
    (is_blocked = true AND start_time IS NULL AND end_time IS NULL) OR
    (is_blocked = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

-- Actual bookings
CREATE TABLE public.bookings (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id             uuid            NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  session_type_id       uuid            NOT NULL REFERENCES public.booking_session_types(id) ON DELETE RESTRICT,
  student_user_id       uuid            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id        uuid            NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  starts_at             timestamptz     NOT NULL,
  ends_at               timestamptz     NOT NULL,
  status                booking_status  NOT NULL DEFAULT 'pending',
  student_notes         text            CHECK (char_length(student_notes) <= 500),
  mentor_notes          text            CHECK (char_length(mentor_notes) <= 500),
  cancellation_reason   text            CHECK (char_length(cancellation_reason) <= 300),
  cancelled_by          text            CHECK (cancelled_by IN ('mentor', 'student')),
  live_class_id         uuid            REFERENCES public.live_classes(id) ON DELETE SET NULL,
  reminder_24h_sent_at  timestamptz,
  reminder_1h_sent_at   timestamptz,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT valid_booking_window CHECK (ends_at > starts_at)
);

-- Indexes for common queries
CREATE INDEX bookings_trader_id_starts_at ON public.bookings(trader_id, starts_at);
CREATE INDEX bookings_student_user_id ON public.bookings(student_user_id);
CREATE INDEX bookings_status ON public.bookings(status);
CREATE INDEX bookings_reminders ON public.bookings(starts_at) WHERE status = 'confirmed';

-- RLS
ALTER TABLE public.booking_session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- booking_session_types: mentor manages, verified students read active types
CREATE POLICY "tenant manages session types"
  ON public.booking_session_types FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "verified students read active session types"
  ON public.booking_session_types FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = booking_session_types.trader_id
        AND sa.status = 'verified'
    )
  );

-- mentor_availability: mentor manages, verified students read active windows
CREATE POLICY "tenant manages availability"
  ON public.mentor_availability FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "verified students read availability"
  ON public.mentor_availability FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = mentor_availability.trader_id
        AND sa.status = 'verified'
    )
  );

-- availability_overrides: mentor manages, verified students read
CREATE POLICY "tenant manages overrides"
  ON public.availability_overrides FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "verified students read overrides"
  ON public.availability_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = availability_overrides.trader_id
        AND sa.status = 'verified'
    )
  );

-- bookings: mentor sees all bookings for their trader; student sees their own
CREATE POLICY "tenant sees all bookings"
  ON public.bookings FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "students see own bookings"
  ON public.bookings FOR SELECT
  USING (student_user_id = auth.uid());

CREATE POLICY "students create own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (student_user_id = auth.uid());

CREATE POLICY "students cancel own bookings"
  ON public.bookings FOR UPDATE
  USING (student_user_id = auth.uid())
  WITH CHECK (student_user_id = auth.uid());
```

---

## Change 2 — API: Session Types CRUD

### POST /api/bookings/session-types

**New file:** `app/api/bookings/session-types/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  durationMinutes: z.number().int().refine(v => [15,30,45,60,90,120].includes(v)),
  maxParticipants: z.number().int().min(1).max(50).default(1),
  bufferMinutes: z.number().int().refine(v => [0,5,10,15,30].includes(v)).default(0),
  requiresApproval: z.boolean().default(false),
  advanceBookingDays: z.number().int().min(1).max(60).default(14),
  minNoticeHours: z.number().int().min(1).max(72).default(24),
  cancellationHours: z.number().int().min(0).max(48).default(12),
  zoomMeetingId: z.string().trim().max(50).nullable().optional(),
  zoomPasscode: z.string().trim().max(50).nullable().optional(),
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
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 403 });

  const d = parsed.data;
  const { data, error } = await supabase
    .from("booking_session_types")
    .insert({
      trader_id: membership.trader_id,
      name: d.name,
      description: d.description ?? null,
      duration_minutes: d.durationMinutes,
      max_participants: d.maxParticipants,
      buffer_minutes: d.bufferMinutes,
      requires_approval: d.requiresApproval,
      advance_booking_days: d.advanceBookingDays,
      min_notice_hours: d.minNoticeHours,
      cancellation_hours: d.cancellationHours,
      zoom_meeting_id: d.zoomMeetingId ?? null,
      zoom_passcode: d.zoomPasscode ?? null,
    })
    .select("id").single();

  if (error) return NextResponse.json({ error: "Could not create session type." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

### PATCH + DELETE /api/bookings/session-types/[typeId]

**New file:** `app/api/bookings/session-types/[typeId]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ typeId: z.string().uuid() });
const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  durationMinutes: z.number().int().refine(v => [15,30,45,60,90,120].includes(v)).optional(),
  maxParticipants: z.number().int().min(1).max(50).optional(),
  bufferMinutes: z.number().int().refine(v => [0,5,10,15,30].includes(v)).optional(),
  requiresApproval: z.boolean().optional(),
  advanceBookingDays: z.number().int().min(1).max(60).optional(),
  minNoticeHours: z.number().int().min(1).max(72).optional(),
  cancellationHours: z.number().int().min(0).max(48).optional(),
  zoomMeetingId: z.string().trim().max(50).nullable().optional(),
  zoomPasscode: z.string().trim().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

async function getContext(context: { params: Promise<{ typeId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members").select("trader_id")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return null;
  return { supabase, tid: membership.trader_id, typeId: params.data.typeId };
}

export async function PATCH(request: Request, context: { params: Promise<{ typeId: string }> }) {
  const ctx = await getContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const d = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description;
  if (d.durationMinutes !== undefined) patch.duration_minutes = d.durationMinutes;
  if (d.maxParticipants !== undefined) patch.max_participants = d.maxParticipants;
  if (d.bufferMinutes !== undefined) patch.buffer_minutes = d.bufferMinutes;
  if (d.requiresApproval !== undefined) patch.requires_approval = d.requiresApproval;
  if (d.advanceBookingDays !== undefined) patch.advance_booking_days = d.advanceBookingDays;
  if (d.minNoticeHours !== undefined) patch.min_notice_hours = d.minNoticeHours;
  if (d.cancellationHours !== undefined) patch.cancellation_hours = d.cancellationHours;
  if (d.zoomMeetingId !== undefined) patch.zoom_meeting_id = d.zoomMeetingId;
  if (d.zoomPasscode !== undefined) patch.zoom_passcode = d.zoomPasscode;
  if (d.isActive !== undefined) patch.is_active = d.isActive;
  if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;

  const { error } = await ctx.supabase
    .from("booking_session_types").update(patch)
    .eq("id", ctx.typeId).eq("trader_id", ctx.tid);
  if (error) return NextResponse.json({ error: "Could not update session type." }, { status: 500 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ typeId: string }> }) {
  const ctx = await getContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Block delete if active bookings exist
  const { count } = await ctx.supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("session_type_id", ctx.typeId)
    .in("status", ["pending", "confirmed"]);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete a session type with active bookings. Deactivate it instead." },
      { status: 409 }
    );
  }

  const { error } = await ctx.supabase
    .from("booking_session_types").delete()
    .eq("id", ctx.typeId).eq("trader_id", ctx.tid);
  if (error) return NextResponse.json({ error: "Could not delete session type." }, { status: 500 });
  return NextResponse.json({ deleted: ctx.typeId });
}
```

---

## Change 3 — Mentor dashboard: Session Types page

**New file:** `app/dashboard/bookings/page.tsx`

This is the entry point for the entire booking management section. It has two sub-sections accessible via tabs: **Session Types** and **Availability** (EP-046 adds Availability; for now only Session Types tab is active).

```typescript
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { BookingSessionTypeManager } from "@/components/booking-session-type-manager";
import { createClient } from "@/lib/supabase/server";

export default async function BookingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name,timezone)")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: sessionTypes } = await supabase
    .from("booking_session_types")
    .select("id,name,description,duration_minutes,max_participants,buffer_minutes,requires_approval,advance_booking_days,min_notice_hours,cancellation_hours,zoom_meeting_id,is_active,sort_order")
    .eq("trader_id", membership.trader_id)
    .order("sort_order").order("created_at");

  const trader = Array.isArray(membership.trader) ? membership.trader[0] : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/bookings"
      description="Manage session types, availability, and student bookings."
      title="Bookings"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <BookingSessionTypeManager
        sessionTypes={sessionTypes ?? []}
        mentorTimezone={trader?.timezone ?? "UTC"}
      />
    </DashboardShell>
  );
}
```

**Note:** `zoom_passcode` is deliberately excluded from the select — never sent to the client.

---

## Change 4 — BookingSessionTypeManager component

**New file:** `components/booking-session-type-manager.tsx`

`"use client"` component. Two-panel layout (same pattern as `LiveClassManager`).

### Types

```typescript
interface SessionType {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  max_participants: number;
  buffer_minutes: number;
  requires_approval: boolean;
  advance_booking_days: number;
  min_notice_hours: number;
  cancellation_hours: number;
  zoom_meeting_id: string | null;
  is_active: boolean;
  sort_order: number;
}
```

### Left panel — session type list

- Header: "Session types" heading + "Add session type" button
- Each row: name, duration badge (e.g. "60 min"), participant badge (e.g. "1-on-1" or "Up to 5"), status chip (Active / Inactive)
- Clicking a row selects it for editing

### Right panel — create / edit form

Fields:

```
Session name *          text, max 80
Description             textarea, max 500, optional
Duration *              select: 15 min / 30 min / 45 min / 60 min / 90 min / 2 hours
Max participants *      number input, 1–50 (label: "1 = one-to-one, 2+ = group")
Buffer time             select: None / 5 min / 10 min / 15 min / 30 min
                        (helper: "Blocked time after each session ends")
Requires approval       toggle (helper: "You manually confirm each booking request")
--- Booking rules section ---
Students can book up to  select: 1 / 2 / 4 / 6 / 8 weeks ahead  (maps to advance_booking_days: 7/14/28/42/56)
Minimum notice          select: 1h / 2h / 4h / 12h / 24h / 48h
Cancellation window     select: None / 4h / 8h / 12h / 24h / 48h
--- Zoom section ---
Zoom Meeting ID         text input, optional
                        (helper: "Students join this meeting when their booking starts")
Zoom Passcode           password input, optional
```

### Actions

- **Save** — POST (create) or PATCH (update)
- **Deactivate / Activate** — PATCH `isActive`
- **Delete** — DELETE with confirmation: "Delete [name]? This cannot be undone. Session types with active bookings cannot be deleted."

### Duration display helpers

```typescript
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1.5 hours";
  return `${minutes / 60} hours`;
}

function formatParticipants(max: number): string {
  return max === 1 ? "1-on-1" : `Up to ${max}`;
}
```

---

## Change 5 — Add Bookings to dashboard nav

**File:** `components/dashboard-shell.tsx`

Find the nav links array. Add an entry for Bookings. Import `CalendarCheck` from lucide-react if not already imported:

```typescript
["Bookings", "/dashboard/bookings", CalendarCheck],
```

Place it after "Live classes" in the nav order.

---

## Change 6 — CSS

**New file:** `components/booking-session-type-manager.module.css`

Match the two-panel layout pattern from `live-class-manager.module.css`. Add a `.durationBadge` and `.participantBadge` styled as small rounded chips.

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-045: booking schema, session types CRUD + mentor UI"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only.

1. Migration applies cleanly — 4 new tables visible in Supabase dashboard
2. `/dashboard/bookings` loads with the session types panel
3. Create a session type (e.g. "Strategy Review, 60 min, 1-on-1") → appears in the list
4. Edit the session type — all fields save correctly
5. Zoom passcode field is never returned in any API response or visible in the network tab
6. Deactivate a session type → chip changes to "Inactive"
7. Delete a session type with no bookings → gone; delete one with active bookings → 409 error shown
8. "Bookings" nav item appears in the dashboard sidebar after the "Live classes" entry
