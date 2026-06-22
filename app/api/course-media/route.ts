import { NextResponse } from "next/server";
import { z } from "zod";
import { COURSE_MEDIA_RULES, fileExtension, requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({
  title: z.string().trim().min(1).max(180),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim(),
  sizeBytes: z.number().int().positive(),
  mediaType: z.enum(["video", "pdf", "image"]),
  replacesMediaId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.supabase.from("course_media")
    .select("id,title,media_type,mime_type,size_bytes,duration_seconds,processing_state,replaced_by_media_id,created_at,lesson_content_blocks(count),resources(count)")
    .eq("trader_id", context.traderId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Media library could not be loaded." }, { status: 400 });
  return NextResponse.json({ media: data ?? [] });
}

export async function POST(request: Request) {
  const context = await requireMentorCourseContext();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid media metadata." }, { status: 400 });
  const input = parsed.data;
  const rule = COURSE_MEDIA_RULES[input.mediaType];
  const extension = fileExtension(input.fileName);
  if (!rule.types.includes(input.mimeType as never) || !rule.extensions.includes(extension as never) || input.sizeBytes > rule.max) {
    return NextResponse.json({ error: "File type, extension, or size is not allowed." }, { status: 400 });
  }
  const mediaId = crypto.randomUUID();
  const storagePath = `${context.traderId}/media/${mediaId}/source.${extension === "jpeg" ? "jpg" : extension}`;
  const { error } = await context.supabase.from("course_media").insert({
    id: mediaId, trader_id: context.traderId, media_type: input.mediaType,
    title: input.title, storage_path: storagePath, mime_type: input.mimeType,
    file_extension: extension, size_bytes: input.sizeBytes, processing_state: "uploading",
    created_by: context.user.id, replaces_media_id: input.replacesMediaId ?? null,
  });
  if (error) return NextResponse.json({ error: "Upload could not be initialized." }, { status: 400 });
  return NextResponse.json({
    mediaId, storagePath,
    uploadUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
    bucketName: "course-content",
  }, { status: 201 });
}
