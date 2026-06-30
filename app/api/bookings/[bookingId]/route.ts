import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation, sendCancellationEmail } from "@/lib/email";

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

    // Send confirmation email to student
    try {
      const admin = createAdminClient();
      if (admin) {
        const [{ data: studentProfile }, { data: trader }, { data: st }] =
          await Promise.all([
            admin
              .from("profiles")
              .select("full_name,email")
              .eq("id", booking.student_user_id)
              .maybeSingle(),
            admin
              .from("traders")
              .select("display_name,timezone")
              .eq("id", booking.trader_id)
              .maybeSingle(),
            admin
              .from("booking_session_types")
              .select("name,duration_minutes")
              .eq("id", booking.session_type_id)
              .maybeSingle(),
          ]);

        if (studentProfile?.email && trader && st) {
          await sendBookingConfirmation({
            to: studentProfile.email,
            studentName: studentProfile.full_name || "Student",
            mentorName: trader.display_name,
            sessionTypeName: st.name,
            startsAt: booking.starts_at,
            durationMinutes: st.duration_minutes,
            recipientTimezone: "UTC",
          });
        }
      }
    } catch (e) {
      console.error("Failed to send confirmation email:", e);
    }
  }

  if (d.action === "cancel") {
    try {
      const admin = createAdminClient();
      if (admin) {
        const [{ data: studentProfile }, { data: trader }, { data: st }] =
          await Promise.all([
            admin
              .from("profiles")
              .select("full_name,email")
              .eq("id", booking.student_user_id)
              .maybeSingle(),
            admin
              .from("traders")
              .select("display_name,timezone,support_email")
              .eq("id", booking.trader_id)
              .maybeSingle(),
            admin
              .from("booking_session_types")
              .select("name")
              .eq("id", booking.session_type_id)
              .maybeSingle(),
          ]);

        const cancelledBy = isMentor ? ("mentor" as const) : ("student" as const);
        const reason = d.reason;

        if (studentProfile?.email && st) {
          await sendCancellationEmail({
            to: studentProfile.email,
            recipientName: studentProfile.full_name || "Student",
            sessionTypeName: st.name,
            startsAt: booking.starts_at,
            recipientTimezone: "UTC",
            cancelledBy,
            reason,
          });
        }

        if (trader?.support_email && !isMentor && st) {
          await sendCancellationEmail({
            to: trader.support_email,
            recipientName: trader.display_name,
            sessionTypeName: st.name,
            startsAt: booking.starts_at,
            recipientTimezone: trader.timezone ?? "UTC",
            cancelledBy,
            reason,
          });
        }
      }
    } catch (e) {
      console.error("Failed to send cancellation email:", e);
    }
  }

  return NextResponse.json({ updated: true });
}
