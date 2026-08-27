import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCourseUser } from "@/lib/course-access";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ lessonId: z.string().uuid(), positionSeconds: z.number().int().min(0), completed: z.boolean().default(false) });

// MB-123: after a lesson is marked complete, check whether every required
// lesson in its course is now done and, if so, issue a certificate. Uses the
// admin client deliberately -- the student's session client may not have
// SELECT access to every required-lesson row depending on RLS, and the
// insert into student_certificates must bypass RLS (it has no
// authenticated-role INSERT policy at all, by design -- only service role
// writes it). Never let a certificate-issuance failure fail the progress
// save itself; the lesson progress write already succeeded and is the part
// that matters -- log and move on, the certificate can be issued on the
// next completion signal (idempotent via the unique constraint).
async function maybeIssueCertificate(courseId: string, traderId: string, studentUserId: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  try {
    // Published lessons for the course -- need the full set, not just
    // required ones, to distinguish "zero required lessons, but some
    // lessons exist" (complete as soon as any is done) from "zero lessons
    // at all" (never issue a certificate), per the brief's edge case.
    const { data: allLessons } = await admin
      .from("lessons")
      .select("id, is_required")
      .eq("course_id", courseId)
      .eq("status", "published");

    if (!allLessons || allLessons.length === 0) return null;

    const requiredLessons = allLessons.filter((l) => l.is_required);
    const gateLessonIds = requiredLessons.length > 0
      ? requiredLessons.map((l) => l.id)
      : allLessons.map((l) => l.id); // no required lessons -> any lesson counts

    const { data: doneRows } = await admin
      .from("lesson_progress")
      .select("lesson_id")
      .eq("student_user_id", studentUserId)
      .eq("course_id", courseId)
      .eq("is_completed", true)
      .in("lesson_id", gateLessonIds);

    const doneCount = doneRows?.length ?? 0;
    const isComplete = requiredLessons.length > 0
      ? doneCount >= requiredLessons.length
      : doneCount >= 1; // zero-required edge case: any one completion is enough
    if (!isComplete) return null;

    const { data: application } = await admin
      .from("student_applications")
      .select("id, portal_id, full_name")
      .eq("trader_id", traderId)
      .eq("student_user_id", studentUserId)
      .maybeSingle();
    if (!application) return null;

    const { data: existing } = await admin
      .from("student_certificates")
      .select("public_token")
      .eq("student_application_id", application.id)
      .eq("course_id", courseId)
      .maybeSingle();
    if (existing) return existing.public_token;

    const [{ data: course }, { data: portal }, { data: profile }] = await Promise.all([
      admin.from("courses").select("title").eq("id", courseId).maybeSingle(),
      admin.from("portals").select("portal_name").eq("id", application.portal_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", studentUserId).maybeSingle(),
    ]);
    if (!course || !portal) return null;

    const studentName = application.full_name?.trim() || profile?.full_name?.trim() || "Student";

    const { data: inserted, error: insertError } = await admin
      .from("student_certificates")
      .insert({
        trader_id: traderId,
        portal_id: application.portal_id,
        student_user_id: studentUserId,
        student_application_id: application.id,
        course_id: courseId,
        student_name: studentName,
        course_title: course.title,
        portal_name: portal.portal_name,
      })
      .select("public_token")
      .single();

    // A unique-violation here just means another request issued it first
    // (or the app-level `existing` check above raced) -- not a real error.
    if (insertError || !inserted) return null;
    return inserted.public_token;
  } catch (err) {
    console.error("MB-123 certificate issuance failed:", err);
    return null;
  }
}

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

  let certificateToken: string | null = null;
  if (parsed.data.completed && data?.course_id && data?.trader_id && data?.student_user_id) {
    certificateToken = await maybeIssueCertificate(data.course_id, data.trader_id, data.student_user_id);
  }

  return NextResponse.json({
    progress: data,
    ok: true,
    ...(certificateToken ? { certificateToken } : {}),
  });
}
