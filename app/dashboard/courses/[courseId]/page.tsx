import { notFound, redirect } from "next/navigation";
import { CourseDetailManager } from "@/components/course-detail-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, displayName } = workspace;
  const tid = workspace.traderId;

  const [
    { data: course },
    { data: moduleRows },
    { data: lessonRows },
    { data: blockRows },
    { data: media },
    { data: groups },
    { data: students },
    { data: grants },
    { data: progressRows },
    { data: resources },
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id,title,description,status,sort_order,access_mode,cover_path")
      .eq("id", courseId)
      .eq("trader_id", tid)
      .maybeSingle(),
    supabase
      .from("course_modules")
      .select("id,title,description,status,sort_order,is_required,requires_previous_completion")
      .eq("course_id", courseId)
      .eq("trader_id", tid)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("lessons")
      .select("id,module_id,title,description,status,sort_order,duration_seconds,is_required")
      .eq("course_id", courseId)
      .eq("trader_id", tid)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("lesson_content_blocks")
      .select("id,lesson_id,block_type,sort_order,media_id")
      .eq("course_id", courseId)
      .eq("trader_id", tid)
      .order("sort_order"),
    supabase
      .from("course_media")
      .select("id,title,media_type,processing_state")
      .eq("trader_id", tid)
      .not("processing_state", "in", "(archived,replaced)"),
    supabase
      .from("student_groups")
      .select("id,name,color")
      .eq("trader_id", tid)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("student_applications")
      .select("student_user_id,full_name")
      .eq("trader_id", tid)
      .eq("status", "verified")
      .not("student_user_id", "is", null)
      .order("full_name"),
    supabase
      .from("content_access_grants")
      .select("group_id,student_user_id")
      .eq("trader_id", tid)
      .eq("entity_type", "course")
      .eq("entity_id", courseId),
    supabase
      .from("lesson_progress")
      .select("student_user_id,lesson_id,is_started,is_completed,last_activity_at")
      .eq("trader_id", tid)
      .eq("course_id", courseId),
    supabase
      .from("resources")
      .select("id,title,status,sort_order")
      .eq("trader_id", tid)
      .eq("course_id", courseId)
      .order("sort_order"),
  ]);
  if (!course) notFound();

  let thumbnailUrl: string | null = null;
  const admin = createAdminClient();
  if (course.cover_path && admin) {
    const { data: signed } = await admin.storage
      .from("course-content")
      .createSignedUrl(course.cover_path, 3600);
    thumbnailUrl = signed?.signedUrl ?? null;
  }

  const blocks = blockRows ?? [];
  const lessons = (lessonRows ?? []).map((l) => ({
    ...l,
    blocks: blocks.filter((b) => b.lesson_id === l.id),
  }));
  const modules = (moduleRows ?? []).map((m) => ({
    ...m,
    lessons: lessons.filter((l) => l.module_id === m.id),
  }));
  const studentList = (students ?? []).filter(
    (s): s is typeof s & { student_user_id: string } =>
      Boolean(s.student_user_id),
  );
  const progress = studentList
    .map((student) => {
      const rows = (progressRows ?? []).filter(
        (p) => p.student_user_id === student.student_user_id,
      );
      return {
        student_user_id: student.student_user_id,
        full_name: student.full_name,
        started: rows.filter((r) => r.is_started).length,
        completed: rows.filter((r) => r.is_completed).length,
        last_activity_at:
          rows.sort((a, b) =>
            (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""),
          )[0]?.last_activity_at ?? null,
      };
    })
    .filter((p) => p.started > 0);

  const totalLessons = lessons.filter(
    (l) => l.is_required && l.status === "published",
  ).length;

  const activityFeed = (progressRows ?? [])
    .filter((p) => p.is_started || p.is_completed)
    .map((p) => {
      const lesson = lessons.find((l) => l.id === p.lesson_id);
      const student = studentList.find(
        (s) => s.student_user_id === p.student_user_id,
      );
      if (!lesson || !student) return null;
      return {
        studentName: student.full_name,
        lessonTitle: lesson.title,
        lessonNumber: lesson.sort_order,
        totalLessons,
        action: (p.is_completed ? "completed" : "started") as
          | "completed"
          | "started",
        lastActivityAt: p.last_activity_at ?? "",
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, 10);

  return (
    <DashboardShell
      activePath="/dashboard/courses"
      description="Manage structured curriculum, protected media, access, and learner progress."
      title={course.title}
      userLabel={displayName}
      traderId={tid}
    >
      <CourseDetailManager
        course={{ ...course, thumbnailUrl }}
        modules={modules}
        media={media ?? []}
        groups={groups ?? []}
        students={studentList}
        selectedGroupIds={(grants ?? [])
          .map((g) => g.group_id)
          .filter((v): v is string => Boolean(v))}
        selectedStudentIds={(grants ?? [])
          .map((g) => g.student_user_id)
          .filter((v): v is string => Boolean(v))}
        progress={progress}
        resources={resources ?? []}
        activityFeed={activityFeed}
      />
    </DashboardShell>
  );
}
