import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ windowId: z.string().uuid() });
const patchSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ windowId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.startTime !== undefined) patch.start_time = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) patch.end_time = parsed.data.endTime;
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;

  const { error } = await supabase
    .from("mentor_availability")
    .update(patch)
    .eq("id", params.data.windowId)
    .eq("trader_id", membership.trader_id);

  if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ windowId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await supabase
    .from("mentor_availability")
    .delete()
    .eq("id", params.data.windowId)
    .eq("trader_id", membership.trader_id);

  if (error) return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  return NextResponse.json({ deleted: params.data.windowId });
}
