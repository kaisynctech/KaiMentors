import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  body:      z.string().trim().min(1).max(2000),
  imagePath: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId, user } = workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabase.from("trade_posts").insert({
    trader_id:  traderId,
    body:       parsed.data.body,
    image_path: parsed.data.imagePath ?? null,
    created_by: user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Could not save post." }, { status: 500 });
  return NextResponse.json({ postId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId } = workspace;

  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("trade_posts").delete().eq("id", id).eq("trader_id", traderId);
  return NextResponse.json({ ok: true });
}
