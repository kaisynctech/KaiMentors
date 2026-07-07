import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(10000),
  publish: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export async function GET() {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await workspace.supabase
    .from("announcements")
    .select("id,title,body,status,is_pinned,published_at,created_at,updated_at")
    .eq("trader_id", workspace.traderId)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Announcements could not be loaded." },
      { status: 400 },
    );
  }

  return NextResponse.json({ announcements: data ?? [] });
}

export async function POST(request: Request) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Title and body are required." },
      { status: 400 },
    );
  }

  const publish = parsed.data.publish ?? false;
  const { data, error } = await workspace.supabase
    .from("announcements")
    .insert({
      trader_id: workspace.traderId,
      title: parsed.data.title,
      body: parsed.data.body,
      status: publish ? "published" : "draft",
      is_pinned: parsed.data.isPinned ?? false,
      published_at: publish ? new Date().toISOString() : null,
      created_by: workspace.user.id,
    })
    .select("id,title,body,status,is_pinned,published_at,created_at,updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "The announcement could not be created." },
      { status: 400 },
    );
  }

  return NextResponse.json({ announcement: data }, { status: 201 });
}
