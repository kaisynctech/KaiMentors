import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCourseUser } from "@/lib/course-access";

const schema = z.object({ lessonId: z.string().uuid(), positionSeconds: z.number().int().min(0), completed: z.boolean().default(false) });

export async function POST(request: Request) {
  const auth = await requireCourseUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid progress update." }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("record_lesson_progress", {
    target_lesson_id: parsed.data.lessonId,
    target_position_seconds: parsed.data.positionSeconds,
    target_completed: parsed.data.completed,
  });
  if (error) return NextResponse.json({ error: "Progress could not be recorded." }, { status: 403 });
  return NextResponse.json({ progress: data });
}
