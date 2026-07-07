import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";

const createSchema = z.object({
  title:       z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;
  const { supabase, traderId, user } = workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabase.from("gallery_albums").insert({
    trader_id:   traderId,
    title:       parsed.data.title,
    description: parsed.data.description ?? null,
    created_by:  user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Could not create album." }, { status: 500 });
  return NextResponse.json({ albumId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;
  const { supabase, traderId } = workspace;

  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("gallery_albums").delete().eq("id", id).eq("trader_id", traderId);
  return NextResponse.json({ ok: true });
}
