# EP-048 — Booking System: Dashboard, My Sessions, Live Class Integration + In-App Notifications

**Status:** Ready for Engineering — implement after EP-047 is verified  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-30  
**Scope:** Mentor booking dashboard, student My Sessions, live class auto-creation, in-app notifications  
**Migration required:** Yes — `notifications` table  
**API changes:** Yes — booking management + notifications endpoints  
**Package install required:** No

---

## Context

This is the final EP in the booking system. It delivers: the mentor's booking management dashboard (approve, confirm, mark complete, add notes), the student's "My Sessions" page (upcoming sessions, cancel, join), automatic Live Class creation when a booking is confirmed, and in-app notifications for both mentor and student.

In-app notifications replace email reminders. Notifications are stored in the database and surfaced via a bell icon in both the mentor dashboard shell and the student portal shell. No external email service is required.

---

## Change 1 — Migration: notifications table

Apply to the KaiMentors Supabase project (`jsbpfhfmumjbrnymhtvq`):

```sql
CREATE TABLE public.notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  booking_id  uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  type        text        NOT NULL CHECK (type IN ('booking_request','booking_confirmed','booking_cancelled','booking_declined')),
  title       text        NOT NULL,
  body        text        NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_user_all_idx    ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users mark own read"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- INSERT is restricted to the service-role admin client (bypasses RLS automatically)
```

---

## Change 2 — Notification utility

**New file:** `lib/notifications.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

export interface NotificationPayload {
  userId: string;
  traderId: string;
  bookingId: string;
  type: "booking_request" | "booking_confirmed" | "booking_cancelled" | "booking_declined";
  title: string;
  body: string;
}

/**
 * Insert a notification record via the service-role admin client.
 * Non-fatal — never throws; only logs on error.
 */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin.from("notifications").insert({
      user_id: payload.userId,
      trader_id: payload.traderId,
      booking_id: payload.bookingId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
    });
  } catch (e) {
    console.error("createNotification failed:", e);
  }
}
```

---

## Change 3 — Notifications API

### GET /api/notifications

**New file:** `app/api/notifications/route.ts`

Returns the 20 most recent notifications for the authenticated user, newest first.

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data } = await supabase
    .from("notifications")
    .select("id,type,title,body,booking_id,read_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json(data ?? []);
}
```

### PATCH /api/notifications/[notificationId]

**New file:** `app/api/notifications/[notificationId]/route.ts`

Marks a single notification as read. RLS ensures a user can only update their own rows.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  const params = z.object({ notificationId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", params.data.notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
  return NextResponse.json({ updated: true });
}
```

---

## Change 4 — Notification bell component

**New file:** `components/notification-bell.tsx`

Client component used in both the mentor dashboard shell and the student portal shell. Fetches unread notifications on mount and whenever the window regains focus. Clicking an unread notification marks it as read.

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  booking_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      setNotifications(await res.json());
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const unread = notifications.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 6,
          borderRadius: 6,
          color: "inherit",
        }}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              background: "#e53e3e",
              color: "#fff",
              borderRadius: "50%",
              fontSize: 10,
              fontWeight: 700,
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              No notifications
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                maxHeight: 360,
                overflowY: "auto",
              }}
            >
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => { if (!n.read_at) markRead(n.id); }}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    background: n.read_at ? "transparent" : "#f0f9ff",
                    cursor: n.read_at ? "default" : "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                    {new Date(n.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Change 5 — Add notification bell to shells

### Mentor dashboard shell

**File:** `components/dashboard-shell.tsx`

Use `Edit`. Import `NotificationBell` and render it in the header area next to the user display label. The exact position depends on the existing header markup — place it immediately before or after the user display name so it is visible on every dashboard page.

```tsx
import { NotificationBell } from "@/components/notification-bell";
// In the header JSX, alongside the user label:
<NotificationBell />
```

### Student portal shell

**File:** `components/student-shell-client.tsx`

Same import and placement as above:

```tsx
import { NotificationBell } from "@/components/notification-bell";
// In the header JSX, alongside the user display name:
<NotificationBell />
```

---

## Change 6 — Booking management API

### PATCH /api/bookings/[bookingId]

**New file:** `app/api/bookings/[bookingId]/route.ts`

Handles mentor actions (confirm, cancel, complete, no-show, notes) and student cancellation. Fires `createNotification()` instead of sending emails.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

const paramsSchema = z.object({ bookingId: z.string().uuid() });

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("no_show") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("notes"), mentorNotes: z.string().trim().max(500) }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const bookingId = params.data.bookingId;

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id,trader_id,student_user_id,application_id,starts_at,ends_at,status,session_type_id,live_class_id",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const isMentor = membership?.trader_id === booking.trader_id;
  const isStudent = booking.student_user_id === user.id;
  if (!isMentor && !isStudent) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const action = parsed.data.action;

  if (action === "confirm"  && !isMentor) return NextResponse.json({ error: "Mentor only." }, { status: 403 });
  if (action === "complete" && !isMentor) return NextResponse.json({ error: "Mentor only." }, { status: 403 });
  if (action === "no_show"  && !isMentor) return NextResponse.json({ error: "Mentor only." }, { status: 403 });
  if (action === "notes"    && !isMentor) return NextResponse.json({ error: "Mentor only." }, { status: 403 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (action === "confirm") {
    patch.status = "confirmed";
  } else if (action === "complete") {
    patch.status = "completed";
  } else if (action === "no_show") {
    patch.status = "no_show";
  } else if (action === "cancel") {
    patch.status = "cancelled";
    patch.cancelled_by = isMentor ? "mentor" : "student";
    if (parsed.data.action === "cancel" && parsed.data.reason) {
      patch.cancellation_reason = parsed.data.reason;
    }
  } else if (action === "notes") {
    if (parsed.data.action === "notes") patch.mentor_notes = parsed.data.mentorNotes;
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", bookingId);
  if (updateError) return NextResponse.json({ error: "Could not update booking." }, { status: 500 });

  // ── Post-action side effects ──────────────────────────────────────────────
  const admin = createAdminClient();

  if (action === "confirm" && admin) {
    // Fetch session type for live class creation
    const { data: sessionType } = await admin
      .from("booking_session_types")
      .select("name,duration_minutes,zoom_meeting_id,zoom_passcode")
      .eq("id", booking.session_type_id)
      .maybeSingle();

    // Auto-create a Live Class linked to this booking (if not already linked)
    if (sessionType && !booking.live_class_id) {
      const { data: liveClass } = await admin
        .from("live_classes")
        .insert({
          trader_id: booking.trader_id,
          created_by: user.id,
          title: sessionType.name,
          provider: sessionType.zoom_meeting_id ? "zoom" : "other",
          meeting_id: sessionType.zoom_meeting_id ?? null,
          meeting_passcode: sessionType.zoom_passcode ?? null,
          join_url: null,
          starts_at: booking.starts_at,
          ends_at: booking.ends_at,
          status: "published",
          room_status: "scheduled",
        })
        .select("id")
        .single();

      if (liveClass) {
        await supabase
          .from("bookings")
          .update({ live_class_id: liveClass.id })
          .eq("id", bookingId);
      }
    }

    // Notify student: session confirmed
    const { data: trader } = await admin
      .from("traders")
      .select("display_name")
      .eq("id", booking.trader_id)
      .maybeSingle();

    const startsAt = new Date(booking.starts_at).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    await createNotification({
      userId: booking.student_user_id,
      traderId: booking.trader_id,
      bookingId,
      type: "booking_confirmed",
      title: "Session confirmed",
      body: `Your session with ${trader?.display_name ?? "your mentor"} on ${startsAt} has been confirmed.`,
    });
  }

  if (action === "cancel") {
    const admin2 = createAdminClient();
    if (admin2) {
      const [{ data: trader }, { data: st }] = await Promise.all([
        admin2.from("traders").select("display_name").eq("id", booking.trader_id).maybeSingle(),
        admin2
          .from("booking_session_types")
          .select("name")
          .eq("id", booking.session_type_id)
          .maybeSingle(),
      ]);

      const startsAt = new Date(booking.starts_at).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const sessionName = st?.name ?? "session";

      if (isMentor) {
        // Notify the student
        await createNotification({
          userId: booking.student_user_id,
          traderId: booking.trader_id,
          bookingId,
          type: "booking_cancelled",
          title: "Session cancelled",
          body: `Your ${sessionName} on ${startsAt} has been cancelled by your mentor.`,
        });
      } else {
        // Notify the mentor — resolve their user_id from trader_members
        const { data: mentorMember } = await admin2
          .from("trader_members")
          .select("user_id")
          .eq("trader_id", booking.trader_id)
          .order("created_at")
          .limit(1)
          .maybeSingle();

        if (mentorMember) {
          await createNotification({
            userId: mentorMember.user_id,
            traderId: booking.trader_id,
            bookingId,
            type: "booking_cancelled",
            title: "Booking cancelled by student",
            body: `A student cancelled their ${sessionName} scheduled for ${startsAt}.`,
          });
        }
      }
    }
  }

  return NextResponse.json({ updated: true });
}
```

---

## Change 7 — Notify mentor on new booking request

**File:** `app/api/bookings/route.ts` (created in EP-047)

**Use `Edit` — do not overwrite this file.**

Add the following import at the top of the file alongside existing imports:

```typescript
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
```

After the successful `.insert()` call that creates the booking (where `newBooking.id` is available), add this block:

```typescript
// Notify mentor if session type requires approval
if (sessionType?.requires_approval) {
  const adminForNotif = createAdminClient();
  if (adminForNotif) {
    const { data: mentorMember } = await adminForNotif
      .from("trader_members")
      .select("user_id")
      .eq("trader_id", traderId)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (mentorMember) {
      const startsAt = new Date(body.startsAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      await createNotification({
        userId: mentorMember.user_id,
        traderId,
        bookingId: newBooking.id,
        type: "booking_request",
        title: "New booking request",
        body: `A student has requested a ${sessionType.name} on ${startsAt}.`,
      });
    }
  }
}
```

**Note:** Adapt the variable names (`traderId`, `body.startsAt`, `sessionType`, `newBooking.id`) to match the actual variable names already in the route. Do not change any existing logic — this block is additive only.

---

## Change 8 — Mentor booking dashboard tab

**File:** `app/dashboard/bookings/page.tsx`

Use `Edit` to add a fourth fetch to the existing `Promise.all`:

```typescript
const [
  { data: sessionTypes },
  { data: windows },
  { data: overrides },
  { data: bookings },
] = await Promise.all([
  supabase
    .from("booking_session_types")
    .select(
      "id,name,description,duration_minutes,max_participants,buffer_minutes,requires_approval,advance_booking_days,min_notice_hours,cancellation_hours,zoom_meeting_id,is_active,sort_order",
    )
    .eq("trader_id", membership.trader_id)
    .order("sort_order")
    .order("created_at"),
  supabase
    .from("mentor_availability")
    .select("id,day_of_week,start_time,end_time,is_active")
    .eq("trader_id", membership.trader_id)
    .order("day_of_week")
    .order("start_time"),
  supabase
    .from("availability_overrides")
    .select("id,override_date,start_time,end_time,is_blocked,reason")
    .eq("trader_id", membership.trader_id)
    .gte("override_date", new Date().toISOString().slice(0, 10))
    .order("override_date")
    .limit(60),
  supabase
    .from("bookings")
    .select(
      "id,student_user_id,session_type_id,starts_at,ends_at,status,student_notes,mentor_notes,cancellation_reason,cancelled_by,live_class_id,application:student_applications!application_id(full_name)",
    )
    .eq("trader_id", membership.trader_id)
    .order("starts_at", { ascending: false })
    .limit(100),
]);
```

Also fetch the mentor's timezone and pass it as a prop:

```typescript
const { data: trader } = await supabase
  .from("traders")
  .select("timezone")
  .eq("id", membership.trader_id)
  .maybeSingle();
```

Pass `bookings` and `mentorTimezone={trader?.timezone ?? "UTC"}` to `BookingSessionTypeManager`.

### Bookings tab (add to `components/booking-session-type-manager.tsx`)

Use `Edit`. Add a third tab to the existing tab bar: **Session types | Availability | Bookings**.

The Bookings tab contains:

**1. Upcoming session banner**

At the top of the tab, check if any confirmed booking has `starts_at` within the next 24 hours:

```typescript
const now = new Date();
const upcomingSoon = bookings?.find(
  (b) =>
    b.status === "confirmed" &&
    new Date(b.starts_at) > now &&
    new Date(b.starts_at).getTime() - now.getTime() < 24 * 60 * 60 * 1000,
);
```

If found, render a dismissible info banner:

```
📅  Upcoming: [session name] at [time in mentorTimezone] · [X hours away]
```

If `now` is within 15 minutes of `upcomingSoon.starts_at` and `live_class_id` is set, add a "Join now →" link to `/dashboard/live-classes/[live_class_id]/host`.

**2. Filter bar**

Button group: **All | Pending | Upcoming | Cancelled | Past**

- Pending: status = `pending`
- Upcoming: status = `confirmed`, `starts_at > now`
- Cancelled: status = `cancelled`
- Past: status = `completed` or `no_show`, or `starts_at <= now`

**3. Booking list**

Each row shows:
- Student name (`application.full_name`)
- Session type name (look up from `sessionTypes` by `session_type_id`)
- Date and time formatted in `mentorTimezone` using `Intl.DateTimeFormat`
- Status badge: `pending` (amber), `confirmed` (green), `cancelled` (red), `completed` (grey), `no_show` (dark red)

Clicking a row expands it inline to reveal:

- **Student notes** — read-only text
- **Mentor notes** — `<textarea>` (max 500 chars), saves on blur:
  ```typescript
  async function saveNotes(bookingId: string, notes: string) {
    await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notes", mentorNotes: notes }),
    });
  }
  ```
- **Action buttons** based on status:
  - `pending` → "Confirm" + "Decline"
  - `confirmed` → "Mark complete" + "Mark no-show" + "Cancel"
  - `completed` / `cancelled` / `no_show` → no buttons (read-only)
- **Cancel/Decline modal** — when either is triggered, show a modal with an optional reason textarea (300 chars max). Confirm fires `action: "cancel"` with the reason.

After any action, call `router.refresh()` to reload server data.

---

## Change 9 — Student "My Sessions" page

**New file:** `app/student/bookings/sessions/page.tsx`

```typescript
import { redirect } from "next/navigation";
import { getStudentAcademyContext } from "@/lib/student-routing";
import { createClient } from "@/lib/supabase/server";
import { StudentShell } from "@/components/student-shell";
import { StudentSessionsList } from "@/components/student-sessions-list";

export const dynamic = "force-dynamic";

export default async function StudentSessionsPage({
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
    .select(
      "id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)",
    )
    .eq("student_user_id", user.id);
  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);

  const { data: app } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id,trader_id,session_type_id,starts_at,ends_at,status,student_notes,mentor_notes,cancellation_reason,cancelled_by,live_class_id,session_type:booking_session_types!session_type_id(name,duration_minutes,cancellation_hours,zoom_meeting_id)",
    )
    .eq("student_user_id", user.id)
    .eq("trader_id", app.trader_id)
    .order("starts_at", { ascending: false })
    .limit(50);

  const academyName =
    base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = app.status === "verified";

  return (
    <StudentShell
      academyName={academyName}
      basePath={base}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      querySuffix={suffix}
    >
      <div style={{ padding: "24px 32px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
          My Sessions
        </h1>
        <StudentSessionsList
          bookings={bookings ?? []}
          basePath={base}
          querySuffix={suffix}
        />
      </div>
    </StudentShell>
  );
}
```

---

## Change 10 — StudentSessionsList component

**New file:** `components/student-sessions-list.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface SessionType {
  name: string;
  duration_minutes: number;
  cancellation_hours: number;
  zoom_meeting_id: string | null;
}

interface Booking {
  id: string;
  trader_id: string;
  session_type_id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  student_notes: string | null;
  mentor_notes: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  live_class_id: string | null;
  session_type: SessionType | null;
}

interface Props {
  bookings: Booking[];
  basePath: string;
  querySuffix: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending:   "Awaiting confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show:   "No show",
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "#d97706",
  confirmed: "#16a34a",
  cancelled: "#dc2626",
  completed: "#6b7280",
  no_show:   "#7f1d1d",
};

function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
  });
}

export function StudentSessionsList({ bookings, basePath, querySuffix }: Props) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const now = new Date();

  // Upcoming session banner
  const upcomingSoon = bookings.find(
    (b) =>
      b.status === "confirmed" &&
      new Date(b.starts_at) > now &&
      new Date(b.starts_at).getTime() - now.getTime() < 24 * 60 * 60 * 1000,
  );

  const hoursAway = upcomingSoon
    ? Math.round(
        (new Date(upcomingSoon.starts_at).getTime() - now.getTime()) / (60 * 60 * 1000),
      )
    : null;

  const joinReady =
    upcomingSoon &&
    upcomingSoon.live_class_id &&
    new Date(upcomingSoon.starts_at).getTime() - now.getTime() < 15 * 60 * 1000;

  // Split bookings
  const upcoming = bookings
    .filter((b) => new Date(b.starts_at) > now && (b.status === "pending" || b.status === "confirmed"))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const past = bookings.filter(
    (b) =>
      new Date(b.starts_at) <= now ||
      b.status === "completed" ||
      b.status === "cancelled" ||
      b.status === "no_show",
  );

  async function cancelBooking() {
    if (!cancelTarget) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/${cancelTarget}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason: cancelReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not cancel booking.");
        return;
      }
      setCancelTarget(null);
      setCancelReason("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Upcoming session banner */}
      {upcomingSoon && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14, color: "#1d4ed8" }}>
            📅 Upcoming:{" "}
            <strong>{upcomingSoon.session_type?.name ?? "Session"}</strong>{" "}
            at {formatLocal(upcomingSoon.starts_at)}
            {hoursAway !== null && hoursAway > 0 && ` · in ${hoursAway}h`}
          </span>
          {joinReady && upcomingSoon.live_class_id && (
            <a
              href={`${basePath}/student/live-classes/${upcomingSoon.live_class_id}${querySuffix}`}
              style={{
                background: "#1d4ed8",
                color: "#fff",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Join now →
            </a>
          )}
        </div>
      )}

      {/* Upcoming */}
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Upcoming</h2>
      {upcoming.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 24 }}>
          No upcoming sessions.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
          {upcoming.map((b) => {
            const st = b.session_type;
            const canCancel =
              b.status === "confirmed" &&
              st &&
              new Date(b.starts_at).getTime() - now.getTime() >
                st.cancellation_hours * 60 * 60 * 1000;

            return (
              <div
                key={b.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  background: "#fff",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {st?.name ?? "Session"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {formatLocal(b.starts_at)}
                    {st && ` · ${st.duration_minutes} min`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: STATUS_COLORS[b.status] ?? "#6b7280",
                    }}
                  >
                    {STATUS_LABELS[b.status] ?? b.status}
                  </span>
                  {canCancel && (
                    <button
                      onClick={() => {
                        setCancelTarget(b.id);
                        setCancelReason("");
                        setError("");
                      }}
                      style={{
                        fontSize: 12,
                        color: "#dc2626",
                        background: "none",
                        border: "1px solid #dc2626",
                        borderRadius: 5,
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past */}
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Past</h2>
      {past.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 14 }}>No past sessions.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {past.map((b) => (
            <div
              key={b.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "14px 16px",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: b.mentor_notes ? 8 : 0,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {b.session_type?.name ?? "Session"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {formatLocal(b.starts_at)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: STATUS_COLORS[b.status] ?? "#6b7280",
                  }}
                >
                  {STATUS_LABELS[b.status] ?? b.status}
                </span>
              </div>
              {b.status === "completed" && b.mentor_notes && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#374151",
                    background: "#f9fafb",
                    borderRadius: 6,
                    padding: "8px 10px",
                    borderLeft: "3px solid #d1d5db",
                  }}
                >
                  <strong style={{ fontSize: 11, color: "#6b7280" }}>Mentor notes</strong>
                  <br />
                  {b.mentor_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: 380,
              maxWidth: "90vw",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              Cancel session?
            </h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
              This cannot be undone.
            </p>
            <textarea
              placeholder="Reason (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={300}
              rows={3}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                padding: 8,
                fontSize: 13,
                resize: "vertical",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
            {error && (
              <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setCancelTarget(null); setError(""); }}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Keep
              </button>
              <button
                onClick={cancelBooking}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {loading ? "Cancelling…" : "Cancel session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Change 11 — Add "My sessions" to student nav

**File:** `components/student-shell-client.tsx`

Use `Edit`. Add after the "Book a session" nav entry:

```typescript
{ label: "My sessions", href: `${basePath}/student/bookings/sessions${querySuffix}`, icon: CalendarClock }
```

Import `CalendarClock` from `lucide-react` alongside existing icon imports. This nav item should be visible to all students (verified and unverified) since both can have bookings.

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-048: booking dashboard, my sessions, in-app notifications, live class integration"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only. No external service credentials required.

1. Mentor sees a **Bookings** tab on `/dashboard/bookings`
2. Pending booking from EP-047 test — "Confirm" button appears; clicking it:
   - Status changes to `confirmed`
   - A Live Class is auto-created and linked to the booking
   - The student receives an in-app notification ("Session confirmed") in the notification bell
3. Confirmed booking appears on the student's "My Sessions" page at `/student/bookings/sessions`
4. The notification bell (🔔) is visible in the mentor dashboard header with an unread badge count
5. The notification bell is visible in the student portal header
6. Clicking an unread notification marks it as read — the badge count decreases
7. A confirmed session within 24 hours shows the upcoming session banner on the student's "My Sessions" page
8. The "Join now" button appears on the student banner when within 15 minutes of start time
9. A confirmed session within 24 hours shows the upcoming session banner on the mentor's Bookings tab
10. Student cancels a confirmed booking → status changes to `cancelled`; mentor receives a "Booking cancelled by student" notification
11. Mentor declines or cancels a booking → student receives a "Session cancelled" notification
12. Mentor adds notes to a completed booking — notes save and appear in the student's past sessions view
13. `GET /api/notifications` returns 401 without a valid session
14. `PATCH /api/notifications/[id]` with a notification belonging to a different user has no effect (RLS blocks the update)
