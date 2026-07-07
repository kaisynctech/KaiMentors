import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";

const createSchema = z.object({
  title:         z.string().trim().min(1).max(200),
  description:   z.string().trim().max(1000).optional(),
  type:          z.enum(["video", "pdf", "link"]),
  storagePath:   z.string().min(1).optional(),
  externalUrl:   z.string().url().optional(),
  thumbnailPath: z.string().optional(),
  labels:        z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  accessScope:   z.enum(["all_students", "all_verified"]),
  status:        z.enum(["draft", "published"]).default("published"),
  sortOrder:     z.number().int().min(0).max(100000).default(0),
}).refine(
  (v) => (v.type === "link" ? !!v.externalUrl : !!v.storagePath),
  "Provide a storagePath for uploads or externalUrl for links.",
);

export async function POST(request: Request) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid resource details." }, { status: 400 });

  const v = parsed.data;
  const { data, error } = await workspace.supabase
    .from("resource_items")
    .insert({
      trader_id:      workspace.traderId,
      title:          v.title,
      description:    v.description ?? null,
      type:           v.type,
      storage_path:   v.storagePath ?? null,
      external_url:   v.externalUrl ?? null,
      thumbnail_path: v.thumbnailPath ?? null,
      labels:         v.labels,
      access_scope:   v.accessScope,
      status:         v.status,
      sort_order:     v.sortOrder,
      created_by:     workspace.user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Resource could not be saved." }, { status: 400 });
  return NextResponse.json({ resourceId: data.id }, { status: 201 });
}
