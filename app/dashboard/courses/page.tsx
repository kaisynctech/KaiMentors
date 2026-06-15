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

  const { data } = await supabase
    .from("courses")
    .select(
      "id,title,description,status,sort_order,cover_path,lessons(count)",
    )
    .eq("trader_id", membership.trader_id)
    .order("sort_order")
    .order("created_at", { ascending: false });

  const courses = await Promise.all(
    (data ?? []).map(async (course) => {
      let thumbnailUrl: string | null = null;
      if (course.cover_path) {
        const { data: signed } = await supabase.storage
          .from("course-content")
          .createSignedUrl(course.cover_path, 3600);
        thumbnailUrl = signed?.signedUrl ?? null;
      }
      const lessonCount = Array.isArray(course.lessons)
        ? (course.lessons[0]?.count ?? 0)
        : 0;
      return { ...course, thumbnailUrl, lessonCount };
    }),
  );
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
      <CourseManager courses={courses} />
    </DashboardShell>
  );
}
