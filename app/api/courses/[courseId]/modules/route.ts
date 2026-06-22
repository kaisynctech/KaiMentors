import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({ title: z.string().trim().min(1).max(180), description: z.string().trim().max(1200).nullable().optional(), status: z.enum(["draft", "published", "archived"]), sortOrder: z.number().int().min(0).max(100000), isRequired: z.boolean().default(true) });

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid module details." }, { status: 400 });
  const { data: course } = await context.supabase.from("courses").select("id").eq("id", courseId).eq("trader_id", context.traderId).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const { data, error } = await context.supabase.from("course_modules").insert({ trader_id: context.traderId, course_id: courseId, title: parsed.data.title, description: parsed.data.description ?? null, status: parsed.data.status, sort_order: parsed.data.sortOrder, is_required: parsed.data.isRequired, created_by: context.user.id }).select("id").single();
  if (error) return NextResponse.json({ error: "Module could not be created." }, { status: 400 });
  return NextResponse.json({ moduleId: data.id }, { status: 201 });
}
