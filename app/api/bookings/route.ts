import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  sessionTypeId: z.string().uuid(),
  traderId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  studentNotes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { sessionTypeId, traderId, startsAt, endsAt, studentNotes } = parsed.data;

  const { data: app } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("trader_id", traderId)
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: st } = await supabase
    .from("booking_session_types")
    .select("duration_minutes,buffer_minutes,min_notice_hours")
    .eq("id", sessionTypeId)
    .eq("trader_id", traderId)
    .eq("is_active", true)
    .maybeSingle();
  if (!st) return NextResponse.json({ error: "Session type not found." }, { status: 404 });

  const now = new Date();
  const slotStart = new Date(startsAt);
  if (slotStart.getTime() < now.getTime() + st.min_notice_hours * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Slot no longer available." }, { status: 409 });
  }

  const slotEnd = new Date(endsAt);
  const bufferMs = st.buffer_minutes * 60 * 1000;
  const checkStart = new Date(slotStart.getTime() - bufferMs).toISOString();
  const checkEnd = new Date(slotEnd.getTime() + bufferMs).toISOString();

  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id")
    .eq("trader_id", traderId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", checkEnd)
    .gt("ends_at", checkStart)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "That slot was just booked. Please pick another." },
      { status: 409 },
    );
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      trader_id: traderId,
      session_type_id: sessionTypeId,
      student_user_id: user.id,
      application_id: app.id,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "pending",
      student_notes: studentNotes ?? null,
    })
    .select("id,starts_at,ends_at,status")
    .single();

  if (error) return NextResponse.json({ error: "Could not create booking." }, { status: 500 });
  return NextResponse.json(booking, { status: 201 });
}
