import { redirect }           from "next/navigation";
import { CourseManager }       from "@/components/course-manager";
import { CourseMediaLibrary }  from "@/components/course-media-library";
import { CoursesTabs }         from "@/components/courses-tabs";
import { DashboardShell }      from "@/components/dashboard-shell";
import { getMentorWorkspace }  from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const tab = (await searchParams)?.tab === "media" ? "media" : "courses";

  // ── Media tab ─────────────────────────────────────────────────────────────
  if (tab === "media") {
    const { data } = await supabase
      .from("course_media")
      .select(
        "id,title,media_type,mime_type,size_bytes,duration_seconds,processing_state,created_at,lesson_content_blocks(count),resources(count)",
      )
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false });

    const media = (data ?? []).map((item) => ({
      ...item,
      usageCount:
        (Array.isArray(item.lesson_content_blocks)
          ? (item.lesson_content_blocks[0]?.count ?? 0)
          : 0) +
        (Array.isArray(item.resources) ? (item.resources[0]?.count ?? 0) : 0),
    }));

    return (
      <DashboardShell
        activePath="/dashboard/courses"
        description="Create, publish, and organize video learning experiences."
        title="Courses"
        userLabel={displayName}
        traderId={traderId}
      >
        <CoursesTabs activeTab="media" />
        <CourseMediaLibrary media={media} />
      </DashboardShell>
    );
  }

  // ── Courses tab (default) ──────────────────────────────────────────────────
  const [{ data: courseData }, { data: progressData }] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id,title,description,status,sort_order,cover_path,course_modules(count),lessons(id,status)",
      )
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    supabase
      .from("lesson_progress")
      .select("course_id,student_user_id")
      .eq("trader_id", traderId),
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
      const lessonRows           = Array.isArray(course.lessons) ? course.lessons : [];
      const lessonCount          = lessonRows.length;
      const publishedLessonCount = lessonRows.filter((l) => l.status === "published").length;
      const courseProgress       = allProgress.filter((p) => p.course_id === course.id);
      const activeLearnerCount   = new Set(courseProgress.map((p) => p.student_user_id)).size;
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

  const totalLessons   = courses.reduce((sum, c) => sum + c.lessonCount, 0);
  const activeLearners = new Set(allProgress.map((p) => p.student_user_id)).size;
  const stats = {
    totalCourses:  courses.length,
    published:     courses.filter((c) => c.status === "published").length,
    totalLessons,
    activeLearners,
  };

  return (
    <DashboardShell
      activePath="/dashboard/courses"
      description="Create, publish, and organize video learning experiences."
      title="Courses"
      userLabel={displayName}
      traderId={traderId}
    >
      <CoursesTabs activeTab="courses" />
      <CourseManager courses={courses} stats={stats} />
    </DashboardShell>
  );
}
