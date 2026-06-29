import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ classId: z.string().uuid() });

const patchSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  provider: z.enum(["zoom", "google_meet", "teams", "other"]).optional(),
  meetingId: z.string().trim().max(50).nullable().optional(),
  meetingPasscode: z.string().trim().max(50).nullable().optional(),
  joinUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  roomStatus: z.enum(["scheduled", "live", "ended"]).optional(),
  recordingEnabled: z.boolean().optional(),
  recordingUrl: z.string().url().nullable().optional(),
});

async function resolveContext(context: { params: Promise<{ classId: string }> }) {
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
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return null;
  return { supabase, tid: membership.trader_id, classId: params.data.classId };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ classId: string }> },
) {
  const ctx = await resolveContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.title !== undefined) patch.title = d.title;
  if (d.description !== undefined) patch.description = d.description;
  if (d.provider !== undefined) patch.provider = d.provider;
  if (d.meetingId !== undefined) patch.meeting_id = d.meetingId;
  if (d.meetingPasscode !== undefined) patch.meeting_passcode = d.meetingPasscode;
  if (d.joinUrl !== undefined) patch.join_url = d.joinUrl;
  if (d.startsAt !== undefined) patch.starts_at = d.startsAt;
  if (d.endsAt !== undefined) patch.ends_at = d.endsAt;
  if (d.status !== undefined) patch.status = d.status;
  if (d.roomStatus !== undefined) patch.room_status = d.roomStatus;
  if (d.recordingEnabled !== undefined) patch.recording_enabled = d.recordingEnabled;
  if (d.recordingUrl !== undefined) patch.recording_url = d.recordingUrl;

  const { error } = await ctx.supabase
    .from("live_classes")
    .update(patch)
    .eq("id", ctx.classId)
    .eq("trader_id", ctx.tid);

  if (error) return NextResponse.json({ error: "Could not update class." }, { status: 500 });

  return NextResponse.json({ updated: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ classId: string }> },
) {
  const ctx = await resolveContext(context);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await ctx.supabase
    .from("live_classes")
    .delete()
    .eq("id", ctx.classId)
    .eq("trader_id", ctx.tid);

  if (error) return NextResponse.json({ error: "Could not delete class." }, { status: 500 });

  return NextResponse.json({ deleted: ctx.classId });
}
