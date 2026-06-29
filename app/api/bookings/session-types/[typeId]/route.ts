import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const VALID_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
const VALID_BUFFERS = [0, 5, 10, 15, 30] as const;

const paramsSchema = z.object({ typeId: z.string().uuid() });

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  durationMinutes: z
    .number()
    .int()
    .refine((v) => (VALID_DURATIONS as readonly number[]).includes(v))
    .optional(),
  maxParticipants: z.number().int().min(1).max(50).optional(),
  bufferMinutes: z
    .number()
    .int()
    .refine((v) => (VALID_BUFFERS as readonly number[]).includes(v))
    .optional(),
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  return { supabase, tid: membership.trader_id, typeId: params.data.typeId };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ typeId: string }> },
) {
  const ctx = await getContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

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
    .from("booking_session_types")
    .update(patch)
    .eq("id", ctx.typeId)
    .eq("trader_id", ctx.tid);

  if (error) return NextResponse.json({ error: "Could not update session type." }, { status: 500 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ typeId: string }> },
) {
  const ctx = await getContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { count } = await ctx.supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("session_type_id", ctx.typeId)
    .in("status", ["pending", "confirmed"]);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete a session type with active bookings. Deactivate it instead." },
      { status: 409 },
    );
  }

  const { error } = await ctx.supabase
    .from("booking_session_types")
    .delete()
    .eq("id", ctx.typeId)
    .eq("trader_id", ctx.tid);

  if (error) return NextResponse.json({ error: "Could not delete session type." }, { status: 500 });
  return NextResponse.json({ deleted: ctx.typeId });
}
