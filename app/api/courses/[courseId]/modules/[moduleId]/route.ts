import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({
  requiresPreviousCompletion: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string }> },
) {
  const { courseId, moduleId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok)
    return NextResponse.json({ error: context.error }, { status: context.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid module update." }, { status: 400 });

  const { error } = await context.supabase
    .from("course_modules")
    .update({ requires_previous_completion: parsed.data.requiresPreviousCompletion })
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId);

  if (error)
    return NextResponse.json({ error: "Module could not be updated." }, { status: 400 });

  return NextResponse.json({ status: "updated" });
}
