import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";

const schema = z.object({
  fileName:    z.string().min(1).max(200),
  contentType: z.enum([
    "video/mp4", "video/webm", "video/quicktime",
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
  ]),
  subPath: z.enum(["resources", "resources/thumbnails"]).default("resources"),
});

export async function POST(request: Request) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  const { fileName, contentType, subPath } = parsed.data;
  const ext         = fileName.split(".").pop() ?? "bin";
  const uuid        = crypto.randomUUID();
  const storagePath = `${workspace.traderId}/${subPath}/${uuid}.${ext}`;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  const { data, error } = await admin.storage
    .from("academy-media")
    .createSignedUploadUrl(storagePath);

  if (error || !data) return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath, token: data.token });
}
