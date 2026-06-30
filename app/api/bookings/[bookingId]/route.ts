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
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("notes"),
    mentorNotes: z.string().trim().max(500),
  }),
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const d = parsed.data;

  if (d.action === "confirm" && !isMentor)
    return NextResponse.json({ error: "Mentor only." }, { status: 403 });
  if (d.action === "complete" && !isMentor)
    return NextResponse.json({ error: "Mentor only." }, { status: 403 });
  if (d.action === "no_show" && !isMentor)
    return NextResponse.json({ error: "Mentor only." }, { status: 403 });
  if (d.action === "notes" && !isMentor)
    return NextResponse.json({ error: "Mentor only." }, { status: 403 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (d.action === "confirm") {
    patch.status = "confirmed";
  } else if (d.action === "complete") {
    patch.status = "completed";
  } else if (d.action === "no_show") {
    patch.status = "no_show";
  } else if (d.action === "cancel") {
    patch.status = "cancelled";
    patch.cancelled_by = isMentor ? "mentor" : "student";
    if (d.reason) patch.cancellation_reason = d.reason;
  } else if (d.action === "notes") {
    patch.mentor_notes = d.mentorNotes;
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", bookingId);
  if (updateError) return NextResponse.json({ error: "Could not update booking." }, { status: 500 });

  // ── Side effects ──────────────────────────────────────────────

  if (d.action === "confirm") {
    // Auto-create Live Class from the session type's Zoom credentials
    const { data: sessionType } = await supabase
      .from("booking_session_types")
      .select("name,duration_minutes,zoom_meeting_id,zoom_passcode")
      .eq("id", booking.session_type_id)
      .maybeSingle();

    if (sessionType && !booking.live_class_id) {
      const { data: liveClass } = await supabase
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

    // Notify student
    const sessionName = sessionType?.name ?? "session";
    const dateStr = new Date(booking.starts_at).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    await createNotification({
      userId: booking.student_user_id,
      traderId: booking.trader_id,
      bookingId: booking.id,
      type: "booking_confirmed",
      title: "Session confirmed",
      body: `Your "${sessionName}" session on ${dateStr} has been confirmed.`,
    });
  }

  if (d.action === "cancel") {
    const dateStr = new Date(booking.starts_at).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (isMentor) {
      // Notify student
      await createNotification({
        userId: booking.student_user_id,
        traderId: booking.trader_id,
        bookingId: booking.id,
        type: "booking_cancelled",
        title: "Session cancelled",
        body: `Your session on ${dateStr} has been cancelled by your mentor.`,
      });
    } else {
      // Student cancelled — notify all mentor members
      const admin = createAdminClient();
      if (admin) {
        const { data: members } = await admin
          .from("trader_members")
          .select("user_id")
          .eq("trader_id", booking.trader_id);

        if (members) {
          await Promise.all(
            members.map((m) =>
              createNotification({
                userId: m.user_id,
                traderId: booking.trader_id,
                bookingId: booking.id,
                type: "booking_cancelled",
                title: "Session cancelled by student",
                body: `A student has cancelled their session on ${dateStr}.`,
              }),
            ),
          );
        }
      }
    }
  }

  return NextResponse.json({ updated: true });
}
