import { NextResponse } from "next/server";
import { requireMentorCourseContext } from "@/lib/course-access";

interface RouteProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export async function POST(_request: Request, { params }: RouteProps) {
  const { courseId, lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data: source } = await context.supabase
    .from("lessons")
    .select("id,module_id,title,description,duration_seconds,sort_order,is_required")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();
  if (!source) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  // Shift sort_order of all sibling lessons after the original (descending to avoid collisions)
  const { data: siblings } = await context.supabase
    .from("lessons")
    .select("id,sort_order")
    .eq("module_id", source.module_id)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .gt("sort_order", source.sort_order)
    .order("sort_order", { ascending: false });

  for (const sibling of siblings ?? []) {
    await context.supabase
      .from("lessons")
      .update({ sort_order: sibling.sort_order + 1 })
      .eq("id", sibling.id)
      .eq("trader_id", context.traderId);
  }

  // Insert the duplicate lesson
  const { data: copy, error: copyError } = await context.supabase
    .from("lessons")
    .insert({
      trader_id: context.traderId,
      course_id: courseId,
      module_id: source.module_id,
      title: `Copy of ${source.title}`,
      description: source.description,
      duration_seconds: source.duration_seconds,
      status: "draft",
      sort_order: source.sort_order + 1,
      is_required: source.is_required,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (copyError || !copy) {
    return NextResponse.json({ error: "Could not duplicate lesson." }, { status: 400 });
  }

  // Copy content blocks
  const { data: blocks } = await context.supabase
    .from("lesson_content_blocks")
    .select("id,block_type,sort_order,is_required,media_id,content")
    .eq("lesson_id", lessonId)
    .eq("trader_id", context.traderId);

  for (const block of blocks ?? []) {
    const { data: newBlock } = await context.supabase
      .from("lesson_content_blocks")
      .insert({
        lesson_id: copy.id,
        course_id: courseId,
        trader_id: context.traderId,
        created_by: context.user.id,
        block_type: block.block_type,
        sort_order: block.sort_order,
        media_id: block.media_id,
        content: block.content,
        is_required: block.is_required,
      })
      .select("id")
      .single();

    // Copy gallery media join rows
    if (block.block_type === "gallery" && newBlock) {
      const { data: galleryItems } = await context.supabase
        .from("lesson_content_block_media")
        .select("media_id,sort_order")
        .eq("block_id", block.id);

      for (const item of galleryItems ?? []) {
        await context.supabase.from("lesson_content_block_media").insert({
          block_id: newBlock.id,
          lesson_id: copy.id,
          course_id: courseId,
          trader_id: context.traderId,
          media_id: item.media_id,
          sort_order: item.sort_order,
        });
      }
    }
  }

  return NextResponse.json({ lessonId: copy.id });
}
