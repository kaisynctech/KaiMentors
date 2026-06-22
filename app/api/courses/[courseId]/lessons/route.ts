import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({
  moduleId: z.string().uuid(), title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1200).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.number().int().min(0).max(100000), isRequired: z.boolean().default(true),
});

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
  return NextResponse.json({ lessonId: data.id }, { status: 201 });
}
