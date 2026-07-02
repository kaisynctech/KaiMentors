import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.discriminatedUnion("type", [
  z.object({
    type:     z.literal("photo"),
    albumId:  z.string().uuid(),
    filePath: z.string().min(1),
    caption:  z.string().max(300).optional(),
  }),
  z.object({
    type:     z.literal("video_upload"),
    albumId:  z.string().uuid(),
    filePath: z.string().min(1),
    caption:  z.string().max(300).optional(),
  }),
  z.object({
    type:     z.literal("video_link"),
    albumId:  z.string().uuid(),
    videoUrl: z.string().url().max(500),
    caption:  z.string().max(300).optional(),
  }),
]);

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId, user } = workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const d = parsed.data;
  const { data, error } = await supabase.from("gallery_items").insert({
    trader_id:  traderId,
    album_id:   d.albumId,
    type:       d.type,
    file_path:  d.type !== "video_link" ? d.filePath : null,
    video_url:  d.type === "video_link"  ? d.videoUrl : null,
    caption:    d.caption ?? null,
    created_by: user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Could not save item." }, { status: 500 });
  return NextResponse.json({ itemId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId } = workspace;

  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("gallery_items").delete().eq("id", id).eq("trader_id", traderId);
  return NextResponse.json({ ok: true });
}
