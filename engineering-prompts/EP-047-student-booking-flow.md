# EP-047 — Booking System: Student Booking Flow

**Status:** Ready for Engineering — implement after EP-046 is verified  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Slot generation API + student booking page + booking confirmation  
**Migration required:** No  
**API changes:** Yes — slot generation + booking creation endpoints  
**Package install required:** No

---

## Context

This EP gives students the ability to browse available slots and book a session. The slot generation algorithm is the critical piece — it computes available time slots by combining the mentor's weekly availability, date overrides, existing bookings, and the rules defined on each session type (min notice, buffer time, advance booking window).

All times are stored in UTC. The student's browser detects their local timezone and passes it as a query parameter so slots can be displayed correctly.

---

## Change 1 — Slot generation API

**New file:** `app/api/bookings/slots/route.ts`

This is a `GET` endpoint. It takes `traderId`, `sessionTypeId`, `from` (date), `to` (date), and `tz` (IANA timezone string) as query params and returns available UTC slot timestamps.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  traderId: z.string().uuid(),
  sessionTypeId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  tz: z.string().min(1).max(80),
});

// Convert "HH:MM" time string + a date + timezone to a UTC Date
function localTimeToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  // Use Intl to find the UTC offset for this timezone at this date/time
  const localDate = new Date(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  // Compute offset by comparing local interpretation vs UTC
  const parts = formatter.formatToParts(localDate);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const interpreted = new Date(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second")
  );
  const offsetMs = localDate.getTime() - interpreted.getTime();
  return new Date(localDate.getTime() + offsetMs);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    traderId: url.searchParams.get("traderId"),
    sessionTypeId: url.searchParams.get("sessionTypeId"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    tz: url.searchParams.get("tz"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  const { traderId, sessionTypeId, from, to, tz } = parsed.data;

  // Verify student is verified for this trader
  const { data: application } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("trader_id", traderId)
    .eq("status", "verified")
    .maybeSingle();
  if (!application) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  // Fetch session type
  const { data: sessionType } = await supabase
    .from("booking_session_types")
    .select("id,duration_minutes,max_participants,buffer_minutes,advance_booking_days,min_notice_hours,is_active")
    .eq("id", sessionTypeId)
    .eq("trader_id", traderId)
    .eq("is_active", true)
    .maybeSingle();
  if (!sessionType) return NextResponse.json({ error: "Session type not found." }, { status: 404 });

  // Fetch mentor's timezone
  const { data: trader } = await supabase
    .from("traders")
    .select("timezone")
    .eq("id", traderId)
    .maybeSingle();
  const mentorTz = trader?.timezone ?? "UTC";

  // Fetch weekly availability
  const { data: windows } = await supabase
    .from("mentor_availability")
    .select("day_of_week,start_time,end_time")
    .eq("trader_id", traderId)
    .eq("is_active", true);

  // Fetch overrides in range
  const { data: overrides } = await supabase
    .from("availability_overrides")
    .select("override_date,start_time,end_time,is_blocked")
    .eq("trader_id", traderId)
    .gte("override_date", from)
    .lte("override_date", to);

  // Fetch existing confirmed/pending bookings in range (for conflict detection)
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("starts_at,ends_at,session_type_id")
    .eq("trader_id", traderId)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date(from).toISOString())
    .lte("starts_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());

  const slots: string[] = []; // UTC ISO strings
  const now = new Date();
  const minNoticeMs = sessionType.min_notice_hours * 60 * 60 * 1000;
  const slotDurationMs = sessionType.duration_minutes * 60 * 1000;
  const bufferMs = sessionType.buffer_minutes * 60 * 1000;

  // Iterate each date in range
  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T00:00:00Z");
  const cursor = new Date(fromDate);

  while (cursor <= toDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = new Date(dateStr + "T12:00:00Z").getUTCDay(); // use noon to avoid DST issues

    // Check for override on this date
    const override = (overrides ?? []).find(o => o.override_date === dateStr);
    let windowsForDay: Array<{ start: string; end: string }> = [];

    if (override) {
      if (override.is_blocked) {
        // Day is blocked — skip
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      } else {
        // Day has a custom window
        windowsForDay = [{ start: override.start_time!, end: override.end_time! }];
      }
    } else {
      // Use recurring windows for this day of week
      windowsForDay = (windows ?? [])
        .filter(w => w.day_of_week === dayOfWeek)
        .map(w => ({ start: w.start_time, end: w.end_time }));
    }

    // Generate slots within each window (using mentor's timezone for interpretation)
    for (const window of windowsForDay) {
      const windowStart = localTimeToUTC(dateStr, window.start, mentorTz);
      const windowEnd = localTimeToUTC(dateStr, window.end, mentorTz);

      let slotStart = new Date(windowStart);
      while (slotStart.getTime() + slotDurationMs <= windowEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDurationMs);

        // Skip slots in the past or within min notice
        if (slotStart.getTime() < now.getTime() + minNoticeMs) {
          slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000); // advance by 30 min
          continue;
        }

        // Check conflict with existing bookings (including buffer)
        const hasConflict = (existingBookings ?? []).some(b => {
          const bStart = new Date(b.starts_at);
          const bEnd = new Date(new Date(b.ends_at).getTime() + bufferMs);
          // Also add buffer before this slot for the existing booking's session type
          const slotStartWithBuffer = new Date(slotStart.getTime() - bufferMs);
          return slotStartWithBuffer < bEnd && slotEnd > bStart;
        });

        // Check if slot is already full (for group sessions, count existing bookings)
        const currentParticipants = (existingBookings ?? []).filter(b => {
          const bStart = new Date(b.starts_at);
          return bStart.getTime() === slotStart.getTime() && b.session_type_id === sessionTypeId;
        }).length;

        if (!hasConflict || currentParticipants < sessionType.max_participants) {
          if (currentParticipants < sessionType.max_participants) {
            slots.push(slotStart.toISOString());
          }
        }

        slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000); // 30-min increments
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return NextResponse.json({ slots, mentorTimezone: mentorTz });
}
```

---

## Change 2 — Booking creation API

**New file:** `app/api/bookings/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  traderId: z.string().uuid(),
  sessionTypeId: z.string().uuid(),
  startsAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { traderId, sessionTypeId, startsAt, notes } = parsed.data;

  // Verify student is verified
  const { data: application } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("trader_id", traderId)
    .eq("status", "verified")
    .maybeSingle();
  if (!application) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  // Fetch session type
  const { data: sessionType } = await supabase
    .from("booking_session_types")
    .select("id,duration_minutes,max_participants,min_notice_hours,requires_approval,is_active")
    .eq("id", sessionTypeId)
    .eq("trader_id", traderId)
    .eq("is_active", true)
    .maybeSingle();
  if (!sessionType) return NextResponse.json({ error: "Session type not found." }, { status: 404 });

  // Validate min notice
  const start = new Date(startsAt);
  const minNoticeMs = sessionType.min_notice_hours * 60 * 60 * 1000;
  if (start.getTime() < Date.now() + minNoticeMs) {
    return NextResponse.json({ error: "Not enough notice to book this session." }, { status: 400 });
  }

  // Check for conflicts (re-validate server-side)
  const endsAt = new Date(start.getTime() + sessionType.duration_minutes * 60 * 1000);
  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id")
    .eq("trader_id", traderId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt);

  // For 1-on-1, any conflict blocks. For group, check participant count.
  if (sessionType.max_participants === 1 && (conflicts?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This slot is no longer available." }, { status: 409 });
  }
  if (sessionType.max_participants > 1) {
    const sameSlotCount = (conflicts ?? []).length;
    if (sameSlotCount >= sessionType.max_participants) {
      return NextResponse.json({ error: "This slot is fully booked." }, { status: 409 });
    }
  }

  const initialStatus = sessionType.requires_approval ? "pending" : "confirmed";

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      trader_id: traderId,
      session_type_id: sessionTypeId,
      student_user_id: user.id,
      application_id: application.id,
      starts_at: startsAt,
      ends_at: endsAt.toISOString(),
      status: initialStatus,
      student_notes: notes ?? null,
    })
    .select("id,status")
    .single();

  if (error) return NextResponse.json({ error: "Could not create booking." }, { status: 500 });

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
    requiresApproval: sessionType.requires_approval,
  }, { status: 201 });
}
```

---

## Change 3 — Student booking page

**New file:** `app/student/bookings/page.tsx`

Server component. Fetches the student's trader and all active session types, then passes to the client component.

```typescript
import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { StudentBookingFlow } from "@/components/student-booking-flow";
import { getStudentAcademyContext } from "@/lib/student-routing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudentBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${base}/login${suffix}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/login${suffix}`);

  let appQuery = supabase
    .from("student_applications")
    .select("id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)")
    .eq("student_user_id", user.id);
  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);

  const { data: app } = await appQuery
    .order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = app.status === "verified";

  const { data: sessionTypes } = isVerified
    ? await supabase
        .from("booking_session_types")
        .select("id,name,description,duration_minutes,max_participants,requires_approval,advance_booking_days,min_notice_hours")
        .eq("trader_id", app.trader_id)
        .eq("is_active", true)
        .order("sort_order").order("created_at")
    : { data: null };

  return (
    <StudentShell
      academyName={academyName}
      basePath={base}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      querySuffix={suffix}
    >
      <StudentBookingFlow
        traderId={app.trader_id}
        sessionTypes={sessionTypes ?? []}
        isVerified={isVerified}
        applicationStatus={app.status}
        basePath={base}
        querySuffix={suffix}
      />
    </StudentShell>
  );
}
```

---

## Change 4 — StudentBookingFlow client component

**New file:** `components/student-booking-flow.tsx`

`"use client"` component. Three-step flow:

### Step 1 — Choose session type

Show all active session types as selectable cards. Each card shows:
- Session name
- Duration (e.g. "60 minutes")
- Participants badge (e.g. "1-on-1" or "Group · up to 10")
- Description (if set)
- "Requires approval" notice if `requires_approval === true`

Clicking a card advances to Step 2.

### Step 2 — Pick a date and time

On mount (or when session type changes), detect the student's timezone:
```typescript
const studentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

Fetch available slots from `/api/bookings/slots` for the next `advance_booking_days` days:
```typescript
const from = toDateString(new Date());
const to = toDateString(addDays(new Date(), sessionType.advance_booking_days));
const res = await fetch(
  `/api/bookings/slots?traderId=${traderId}&sessionTypeId=${sessionType.id}&from=${from}&to=${to}&tz=${encodeURIComponent(studentTz)}`
);
const { slots } = await res.json(); // UTC ISO strings
```

Display a calendar-style date picker. For each date that has at least one slot, the date is clickable. Selecting a date shows time buttons for that day's slots, displayed in the student's local timezone:

```typescript
function formatSlotTime(isoUtc: string, tz: string): string {
  return new Date(isoUtc).toLocaleTimeString(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
```

Show a subtle "(times in your timezone)" note beneath the time grid.

Clicking a time slot advances to Step 3.

### Step 3 — Confirm

Show a confirmation summary:
- Session type name
- Date and time (in student's timezone)
- Duration
- Optional notes textarea (max 500 chars)
- "Confirm booking" button

On submit: POST `/api/bookings` with `traderId`, `sessionTypeId`, `startsAt` (UTC ISO), and `notes`. On success:
- If `requiresApproval === false`: show "Booking confirmed! ✓" with the date/time
- If `requiresApproval === true`: show "Request sent — your mentor will confirm shortly"
- In both cases show a "Book another session" button to reset to Step 1

### Back navigation

Each step has a "← Back" link to return to the previous step. Step 1 has no back button.

### Loading and error states

- Slots loading: show skeleton cards with a spinner
- No slots available: "No availability for this period. Check back later."
- Booking error (409 conflict): "This slot was just taken. Please choose another time." — return to Step 2
- General error: "Something went wrong. Please try again."

---

## Change 5 — Add Bookings to student nav

**File:** `components/student-shell-client.tsx`

Find the student nav links array. Add an entry for Bookings:
```typescript
{ label: "Book a session", href: `${basePath}/student/bookings${querySuffix}`, icon: CalendarCheck }
```

Place it after the Live Classes nav item. Import `CalendarCheck` from lucide-react.

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-047: student booking flow + slot generation API"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only. Requires EP-045 and EP-046 to be live with at least one active session type and at least one weekly availability window set.

1. Student navigates to `/student/bookings` — sees session type cards
2. Selects a session type — sees a calendar with available dates highlighted
3. Selects a date — sees time slots displayed in student's local timezone
4. A tooltip or note confirms "times in your local timezone"
5. Selects a time — sees confirmation screen with correct date/time
6. Confirms booking (no approval required) — booking created, "Booking confirmed" shown
7. Booking appears in `bookings` table in Supabase with status `confirmed`
8. Books a session type with `requires_approval = true` — status is `pending`, "Request sent" message shown
9. Attempt to book a slot that was just taken (race condition) — 409 shown, returns to time picker
10. Student without verified status — sees ContentGate, no session types shown
11. "Book a session" appears in the student nav
