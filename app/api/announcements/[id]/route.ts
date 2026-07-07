import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const updateSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  status: z.enum(["draft", "published"]).optional(),
  isPinned: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.isPinned !== undefined) updates.is_pinned = parsed.data.isPinned;
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "published") {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await workspace.supabase
    .from("announcements")
    .update(updates)
    .eq("id", id)
    .eq("trader_id", workspace.traderId)
    .select("id,title,body,status,is_pinned,published_at,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "The announcement could not be updated." },
      { status: 400 },
    );
  }

  return NextResponse.json({ announcement: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await workspace.supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .eq("trader_id", workspace.traderId);

  if (error) {
    return NextResponse.json(
      { error: "The announcement could not be deleted." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
