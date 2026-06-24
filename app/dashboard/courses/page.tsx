import { redirect } from "next/navigation";
import { CourseManager } from "@/components/course-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function CoursesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const [{ data: courseData }, { data: progressData }] = await Promise.all([
    supabase
      .from("courses")
      .select("id,title,description,status,sort_order,cover_path,course_modules(count),lessons(id,status)")
      .eq("trader_id", membership.trader_id)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    supabase
      .from("lesson_progress")
      .select("course_id,student_user_id")
      .eq("trader_id", membership.trader_id),
  ]);

  const allProgress = progressData ?? [];

  const courses = await Promise.all(
    (courseData ?? []).map(async (course) => {
      let thumbnailUrl: string | null = null;
      if (course.cover_path) {
        const { data: signed } = await supabase.storage
          .from("course-content")
          .createSignedUrl(course.cover_path, 3600);
        thumbnailUrl = signed?.signedUrl ?? null;
      }
      const moduleCount = Array.isArray(course.course_modules)
        ? (course.course_modules[0]?.count ?? 0)
        : 0;
      const lessonRows = Array.isArray(course.lessons) ? course.lessons : [];
      const lessonCount = lessonRows.length;
      const publishedLessonCount = lessonRows.filter(
        (l) => l.status === "published",
      ).length;
      const courseProgress = allProgress.filter((p) => p.course_id === course.id);
      const activeLearnerCount = new Set(
        courseProgress.map((p) => p.student_user_id),
      ).size;
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        status: course.status as "draft" | "published" | "archived",
        sort_order: course.sort_order,
        thumbnailUrl,
        lessonCount,
        publishedLessonCount,
        moduleCount,
        activeLearnerCount,
      };
    }),
  );

  const totalLessons = courses.reduce((sum, c) => sum + c.lessonCount, 0);
  const activeLearners = new Set(allProgress.map((p) => p.student_user_id)).size;
  const stats = {
    totalCourses: courses.length,
    published: courses.filter((c) => c.status === "published").length,
    totalLessons,
    activeLearners,
  };

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/courses"
      description="Create, publish, and organize video learning experiences."
      title="Courses"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <CourseManager courses={courses} stats={stats} />
    </DashboardShell>
  );
}
