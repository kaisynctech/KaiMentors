import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";
import { syncGroupGrants } from "@/lib/content-access-grants";

const updateSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  status: z.enum(["draft", "published"]).optional(),
  isPinned: z.boolean().optional(),
  // Undefined = scope untouched (e.g. a bare publish/pin toggle). Present
  // (even as an empty array) = authoritative: recompute access_scope and
  // fully replace this announcement's group grants.
  groupIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

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
  if (parsed.data.groupIds !== undefined) {
    updates.access_scope = parsed.data.groupIds.length > 0 ? "restricted" : "all_verified";
  }

  const { data, error } = await workspace.supabase
    .from("announcements")
    .update(updates)
    .eq("id", id)
    .eq("trader_id", workspace.traderId)
    .select("id,title,body,status,is_pinned,access_scope,published_at,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "The announcement could not be updated." },
      { status: 400 },
    );
  }

  if (parsed.data.groupIds !== undefined) {
    await syncGroupGrants(workspace.supabase, {
      traderId: workspace.traderId,
      entityType: "announcement",
      entityId: id,
      groupIds: parsed.data.groupIds,
      grantedBy: workspace.user.id,
    });
  }

  return NextResponse.json({
    announcement: {
      ...data,
      ...(parsed.data.groupIds !== undefined ? { groupIds: parsed.data.groupIds } : {}),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

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
