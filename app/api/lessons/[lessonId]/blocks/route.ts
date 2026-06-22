import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({ blockType: z.enum(["rich_text", "video", "pdf", "image", "gallery", "link"]), sortOrder: z.number().int().min(0).max(100000), mediaId: z.string().uuid().nullable().optional(), mediaIds: z.array(z.string().uuid()).max(50).default([]), content: z.record(z.unknown()).default({}), isRequired: z.boolean().default(true) }).superRefine((value, ctx) => {
  const mediaBlock = ["video", "pdf", "image", "gallery"].includes(value.blockType);
  const selectedCount = value.blockType === "gallery" ? value.mediaIds.length : Number(Boolean(value.mediaId));
  if (mediaBlock !== (selectedCount > 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Media selection does not match block type." });
  if (value.blockType === "link" && typeof value.content.url !== "string") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Link URL is required." });
});

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lesson content." }, { status: 400 });
  const mediaIds = parsed.data.blockType === "gallery" ? parsed.data.mediaIds : parsed.data.mediaId ? [parsed.data.mediaId] : [];
  const { data, error } = await context.supabase.rpc("create_lesson_content_block", {
    target_lesson_id: lessonId,
    target_block_type: parsed.data.blockType,
    target_sort_order: parsed.data.sortOrder,
    target_content: parsed.data.content,
    target_is_required: parsed.data.isRequired,
    target_media_ids: mediaIds,
  });
  if (error) return NextResponse.json({ error: "Lesson content could not be added." }, { status: 400 });
  return NextResponse.json({ blockId: data }, { status: 201 });
}
