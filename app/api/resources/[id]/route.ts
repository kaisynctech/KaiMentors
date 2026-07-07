import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  labels:      z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  accessScope: z.enum(["all_students", "all_verified"]).optional(),
  status:      z.enum(["draft", "published"]).optional(),
  sortOrder:   z.number().int().min(0).optional(),
});

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

  const { error } = await workspace.supabase
    .from("resource_items")
    .delete()
    .eq("id", id)
    .eq("trader_id", workspace.traderId);

  if (error) return NextResponse.json({ error: "Could not delete resource." }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const v = parsed.data;
  const patch: Record<string, unknown> = {};
  if (v.title       !== undefined) patch.title        = v.title;
  if (v.description !== undefined) patch.description  = v.description;
  if (v.labels      !== undefined) patch.labels       = v.labels;
  if (v.accessScope !== undefined) patch.access_scope = v.accessScope;
  if (v.status      !== undefined) patch.status       = v.status;
  if (v.sortOrder   !== undefined) patch.sort_order   = v.sortOrder;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { error } = await workspace.supabase
    .from("resource_items")
    .update(patch)
    .eq("id", id)
    .eq("trader_id", workspace.traderId);

  if (error) return NextResponse.json({ error: "Could not update resource." }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
