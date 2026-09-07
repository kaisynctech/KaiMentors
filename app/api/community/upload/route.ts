import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMentorWorkspace } from "@/lib/entitlements";
import { fileTooLargeMessage, maxBytesForAcademyUpload } from "@/lib/media-limits";

const schema = z.object({
  fileName:    z.string().min(1).max(200),
  contentType: z.enum([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
  ]),
  sizeBytes: z.number().int().positive(),
  category: z.enum(["gallery", "trades"]),
});

export async function POST(request: Request) {
  const workspaceResult = await requireActiveMentorWorkspace();
  if ("error" in workspaceResult) return workspaceResult.error;
  const workspace = workspaceResult.workspace;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const { fileName, contentType, sizeBytes, category } = parsed.data;
  const max = maxBytesForAcademyUpload(contentType);
  if (sizeBytes > max) {
    return NextResponse.json({ error: fileTooLargeMessage({ name: fileName, size: sizeBytes }, max) }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  }

  const ext = fileName.split(".").pop() ?? "bin";
  const uuid = crypto.randomUUID();
  const storagePath = `${workspace.traderId}/${category}/${uuid}.${ext}`;

  return NextResponse.json({
    storagePath,
    bucketName: "academy-media",
    uploadUrl: `${supabaseUrl}/storage/v1/upload/resumable`,
  });
}
