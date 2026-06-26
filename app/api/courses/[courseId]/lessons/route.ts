import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const blockSchema = z.object({
  blockType: z.enum(["rich_text", "video", "pdf", "image", "gallery", "link"]),
  sortOrder: z.number().int().min(0).max(100000),
  mediaId: z.string().uuid().nullable().optional(),
  galleryMediaIds: z.array(z.string().uuid()).optional().default([]),
  text: z.string().max(50000).optional(),
  url: z.string().url().max(2000).optional(),
  label: z.string().max(200).optional(),
  caption: z.string().max(500).optional(),
  isRequired: z.boolean().default(false),
});

const schema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1200).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.number().int().min(0).max(100000),
  isRequired: z.boolean().default(true),
  blocks: z.array(blockSchema).max(50).optional().default([]),
});

function buildContent(block: z.infer<typeof blockSchema>) {
  if (block.blockType === "rich_text") return { html: block.text ?? "" };
  if (block.blockType === "link") return { url: block.url ?? "", label: block.label ?? "" };
  return { caption: block.caption ?? "" };
}

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lesson details." }, { status: 400 });
  const { data: module } = await context.supabase.from("course_modules").select("id").eq("id", parsed.data.moduleId).eq("course_id", courseId).eq("trader_id", context.traderId).maybeSingle();
  if (!module) return NextResponse.json({ error: "Course module not found." }, { status: 404 });
  const { data, error } = await context.supabase.from("lessons").insert({
    trader_id: context.traderId, course_id: courseId, module_id: module.id,
    title: parsed.data.title, description: parsed.data.description ?? null,
    duration_seconds: parsed.data.durationSeconds ?? null, status: parsed.data.status,
    sort_order: parsed.data.sortOrder, is_required: parsed.data.isRequired,
    published_at: parsed.data.status === "published" ? new Date().toISOString() : null,
    created_by: context.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Lesson could not be created." }, { status: 400 });

  const blocks = parsed.data.blocks;

  if (blocks.length > 0) {
    const allMediaIds = [
      ...blocks.flatMap(b => b.mediaId ? [b.mediaId] : []),
      ...blocks.flatMap(b => b.galleryMediaIds ?? []),
    ];
    if (allMediaIds.length > 0) {
      const { count } = await context.supabase
        .from("course_media")
        .select("id", { count: "exact", head: true })
        .in("id", allMediaIds)
        .eq("trader_id", context.traderId);
      if (count !== allMediaIds.length) {
        await context.supabase.from("lessons").delete().eq("id", data.id);
        return NextResponse.json({ error: "One or more media assets do not belong to this workspace." }, { status: 400 });
      }
    }

    for (const block of blocks) {
      const { data: blockData, error: blockError } = await context.supabase
        .from("lesson_content_blocks")
        .insert({
          lesson_id: data.id,
          trader_id: context.traderId,
          block_type: block.blockType,
          sort_order: block.sortOrder,
          media_id: block.mediaId ?? null,
          content: buildContent(block),
          is_required: block.isRequired ?? false,
        })
        .select("id")
        .single();

      if (blockError || !blockData) {
        await context.supabase.from("lessons").delete().eq("id", data.id);
        return NextResponse.json({ error: "A content block could not be saved." }, { status: 400 });
      }

      if (block.blockType === "gallery") {
        for (const [i, mediaId] of (block.galleryMediaIds ?? []).entries()) {
          await context.supabase.from("lesson_content_block_media").insert({
            block_id: blockData.id,
            media_id: mediaId,
            sort_order: i,
          });
        }
      }
    }
  }

  return NextResponse.json({ lessonId: data.id, blockCount: blocks.length }, { status: 201 });
}
