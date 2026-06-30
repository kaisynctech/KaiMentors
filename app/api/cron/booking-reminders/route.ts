import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingReminder } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const now = new Date();

  const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const window24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  const window1hStart = new Date(now.getTime() + 50 * 60 * 1000).toISOString();
  const window1hEnd = new Date(now.getTime() + 70 * 60 * 1000).toISOString();

  const [{ data: upcoming24h }, { data: upcoming1h }] = await Promise.all([
    admin
      .from("bookings")
      .select("id,trader_id,student_user_id,starts_at,session_type_id")
      .eq("status", "confirmed")
      .is("reminder_24h_sent_at", null)
      .gte("starts_at", window24hStart)
      .lte("starts_at", window24hEnd),
    admin
      .from("bookings")
      .select("id,trader_id,student_user_id,starts_at,session_type_id")
      .eq("status", "confirmed")
      .is("reminder_1h_sent_at", null)
      .gte("starts_at", window1hStart)
      .lte("starts_at", window1hEnd),
  ]);

  let sent24h = 0;
  let sent1h = 0;
  const nowIso = now.toISOString();

  for (const booking of upcoming24h ?? []) {
    try {
      const [{ data: student }, { data: trader }, { data: st }] = await Promise.all([
        admin.from("profiles").select("full_name,email").eq("id", booking.student_user_id).maybeSingle(),
        admin.from("traders").select("display_name,timezone").eq("id", booking.trader_id).maybeSingle(),
        admin.from("booking_session_types").select("name,duration_minutes").eq("id", booking.session_type_id).maybeSingle(),
      ]);
      if (student?.email && trader && st) {
        await sendBookingReminder(
          {
            to: student.email,
            studentName: student.full_name || "Student",
            mentorName: trader.display_name,
            sessionTypeName: st.name,
            startsAt: booking.starts_at,
            durationMinutes: st.duration_minutes,
            recipientTimezone: "UTC",
          },
          24,
        );
        await admin
          .from("bookings")
          .update({ reminder_24h_sent_at: nowIso })
          .eq("id", booking.id);
        sent24h++;
      }
    } catch (e) {
      console.error("24h reminder failed for booking", booking.id, e);
    }
  }

  for (const booking of upcoming1h ?? []) {
    try {
      const [{ data: student }, { data: trader }, { data: st }] = await Promise.all([
        admin.from("profiles").select("full_name,email").eq("id", booking.student_user_id).maybeSingle(),
        admin.from("traders").select("display_name,timezone").eq("id", booking.trader_id).maybeSingle(),
        admin.from("booking_session_types").select("name,duration_minutes").eq("id", booking.session_type_id).maybeSingle(),
      ]);
      if (student?.email && trader && st) {
        await sendBookingReminder(
          {
            to: student.email,
            studentName: student.full_name || "Student",
            mentorName: trader.display_name,
            sessionTypeName: st.name,
            startsAt: booking.starts_at,
            durationMinutes: st.duration_minutes,
            recipientTimezone: "UTC",
          },
          1,
        );
        await admin
          .from("bookings")
          .update({ reminder_1h_sent_at: nowIso })
          .eq("id", booking.id);
        sent1h++;
      }
    } catch (e) {
      console.error("1h reminder failed for booking", booking.id, e);
    }
  }

  return NextResponse.json({ sent24h, sent1h });
}
