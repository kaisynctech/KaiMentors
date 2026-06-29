import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const VALID_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
const VALID_BUFFERS = [0, 5, 10, 15, 30] as const;

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  durationMinutes: z.number().int().refine((v) => (VALID_DURATIONS as readonly number[]).includes(v), {
    message: "Duration must be 15, 30, 45, 60, 90, or 120 minutes.",
  }),
  maxParticipants: z.number().int().min(1).max(50).default(1),
  bufferMinutes: z.number().int().refine((v) => (VALID_BUFFERS as readonly number[]).includes(v), {
    message: "Buffer must be 0, 5, 10, 15, or 30 minutes.",
  }).default(0),
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
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not create session type." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
