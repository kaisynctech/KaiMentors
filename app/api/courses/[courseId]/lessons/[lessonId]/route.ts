import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

// ── Shared schemas (identical to lessons/route.ts) ────────────────────────────

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

const patchSchema = z.object({
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

// ── GET /api/courses/[courseId]/lessons/[lessonId] ────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  const { courseId, lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data: lesson } = await context.supabase
    .from("lessons")
    .select(
      "id,module_id,title,description,status,sort_order,duration_seconds,is_required,published_at," +
      "blocks:lesson_content_blocks(id,block_type,sort_order,is_required,media_id,content," +
        "gallery:lesson_content_block_media(media_id,sort_order))",
    )
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  type RawBlock = {
    id: string;
    block_type: string;
    sort_order: number;
    is_required: boolean;
    media_id: string | null;
    content: Record<string, unknown> | null;
    gallery: Array<{ media_id: string; sort_order: number }> | null;
  };

  type LessonRow = {
    id: string;
    module_id: string;
    title: string;
    description: string | null;
    status: string;
    sort_order: number;
    duration_seconds: number | null;
    is_required: boolean;
    published_at: string | null;
    blocks: RawBlock[] | null;
  };

  const row = lesson as unknown as LessonRow;

  const blocks = ((row.blocks ?? []) as RawBlock[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((b) => ({
      blockType: b.block_type,
      sortOrder: b.sort_order,
      isRequired: b.is_required,
      mediaId: b.media_id ?? null,
      galleryMediaIds: (b.gallery ?? [])
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((g) => g.media_id),
      text: b.block_type === "rich_text" ? ((b.content?.html as string) ?? null) : null,
      url: b.block_type === "link" ? ((b.content?.url as string) ?? null) : null,
      label: b.block_type === "link" ? ((b.content?.label as string) ?? null) : null,
      caption: ["image", "pdf", "video", "gallery"].includes(b.block_type)
        ? ((b.content?.caption as string) ?? null)
        : null,
    }));

  return NextResponse.json({
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    description: row.description,
    status: row.status,
    sortOrder: row.sort_order,
    durationSeconds: row.duration_seconds,
    isRequired: row.is_required,
    publishedAt: row.published_at,
    blocks,
  });
}

// ── PATCH /api/courses/[courseId]/lessons/[lessonId] ──────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  const { courseId, lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lesson details." }, { status: 400 });

  const { data: existing } = await context.supabase
    .from("lessons")
    .select("id,published_at")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  const { data: mod } = await context.supabase
    .from("course_modules")
    .select("id")
    .eq("id", parsed.data.moduleId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();
  if (!mod) return NextResponse.json({ error: "Module not found." }, { status: 404 });

  const blocks = parsed.data.blocks;
  if (blocks.length > 0) {
    const allMediaIds = [
      ...blocks.flatMap((b) => (b.mediaId ? [b.mediaId] : [])),
      ...blocks.flatMap((b) => b.galleryMediaIds ?? []),
    ];
    if (allMediaIds.length > 0) {
      const { count } = await context.supabase
        .from("course_media")
        .select("id", { count: "exact", head: true })
        .in("id", allMediaIds)
        .eq("trader_id", context.traderId);
      if (count !== allMediaIds.length) {
        return NextResponse.json(
          { error: "One or more media assets do not belong to this workspace." },
          { status: 400 },
        );
      }
    }
  }

  const existingPublishedAt = (existing as unknown as { id: string; published_at: string | null }).published_at;
  const publishedAt =
    parsed.data.status === "published"
      ? (existingPublishedAt ?? new Date().toISOString())
      : null;

  const { error: updateError } = await context.supabase
    .from("lessons")
    .update({
      module_id: mod.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      duration_seconds: parsed.data.durationSeconds ?? null,
      status: parsed.data.status,
      sort_order: parsed.data.sortOrder,
      is_required: parsed.data.isRequired,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lessonId)
    .eq("trader_id", context.traderId);

  if (updateError) return NextResponse.json({ error: "Lesson could not be updated." }, { status: 400 });

  await context.supabase
    .from("lesson_content_block_media")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("trader_id", context.traderId);

  await context.supabase
    .from("lesson_content_blocks")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("trader_id", context.traderId);

  for (const block of blocks) {
    const { data: blockData, error: blockError } = await context.supabase
      .from("lesson_content_blocks")
      .insert({
        lesson_id: lessonId,
        course_id: courseId,
        trader_id: context.traderId,
        created_by: context.user.id,
        block_type: block.blockType,
        sort_order: block.sortOrder,
        media_id: block.mediaId ?? null,
        content: buildContent(block),
        is_required: block.isRequired ?? false,
      })
      .select("id")
      .single();

    if (blockError || !blockData) {
      return NextResponse.json(
        { error: "A content block could not be saved. The lesson metadata was updated but blocks may be incomplete." },
        { status: 400 },
      );
    }

    if (block.blockType === "gallery") {
      for (const [i, mediaId] of (block.galleryMediaIds ?? []).entries()) {
        await context.supabase.from("lesson_content_block_media").insert({
          block_id: blockData.id,
          trader_id: context.traderId,
          course_id: courseId,
          lesson_id: lessonId,
          media_id: mediaId,
          sort_order: i,
        });
      }
    }
  }

  return NextResponse.json({ lessonId, blockCount: blocks.length });
}
