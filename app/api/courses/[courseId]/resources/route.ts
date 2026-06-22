import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({
  title: z.string().trim().min(1).max(180),
  lessonId: z.string().uuid().nullable().optional(),
  mediaId: z.string().uuid().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.number().int().min(0).max(100000),
}).refine((value) => Boolean(value.mediaId) !== Boolean(value.externalUrl), "Choose either media or an external link.");

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid resource details." }, { status: 400 });
  const input = parsed.data;
  let storagePath: string | null = null;
  let type: "video" | "pdf" | "file" | "link" = "link";
  if (input.mediaId) {
    const { data: media } = await context.supabase.from("course_media").select("id,storage_path,media_type").eq("id", input.mediaId).eq("trader_id", context.traderId).eq("processing_state", "ready").maybeSingle();
    if (!media) return NextResponse.json({ error: "Media is unavailable." }, { status: 400 });
    storagePath = media.storage_path;
    type = media.media_type === "image" ? "file" : media.media_type;
  }
  if (input.lessonId) {
    const { data: lesson } = await context.supabase.from("lessons").select("id").eq("id", input.lessonId).eq("course_id", courseId).eq("trader_id", context.traderId).maybeSingle();
    if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 400 });
  }
  const { data, error } = await context.supabase.from("resources").insert({
    trader_id: context.traderId, course_id: courseId, lesson_id: input.lessonId ?? null,
    title: input.title, type, storage_path: storagePath, external_url: input.externalUrl ?? null,
    status: input.status, sort_order: input.sortOrder, media_id: input.mediaId ?? null,
    access_scope: "all_verified", created_by: context.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Resource could not be created." }, { status: 400 });
  return NextResponse.json({ resourceId: data.id }, { status: 201 });
}
