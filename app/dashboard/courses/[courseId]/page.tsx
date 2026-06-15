import { notFound, redirect } from "next/navigation";
import { CourseDetailManager } from "@/components/course-detail-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

interface CourseDetailPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseDetailPage({
  params,
}: CourseDetailPageProps) {
  const { courseId } = await params;
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

  const [
    { data: course },
    { data: lessons },
    { data: groups },
    { data: grants },
  ] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id,title,description,status,sort_order,cover_path,access_scope",
      )
      .eq("id", courseId)
      .eq("trader_id", membership.trader_id)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select(
        "id,title,description,status,sort_order,duration_seconds,video_path",
      )
      .eq("course_id", courseId)
      .eq("trader_id", membership.trader_id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("student_groups")
      .select("id,name,color")
      .eq("trader_id", membership.trader_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("content_access_grants")
      .select("group_id")
      .eq("trader_id", membership.trader_id)
      .eq("entity_type", "course")
      .eq("entity_id", courseId)
      .not("group_id", "is", null),
  ]);
  if (!course) notFound();

  let thumbnailUrl: string | null = null;
  if (course.cover_path) {
    const { data: signed } = await supabase.storage
      .from("course-content")
      .createSignedUrl(course.cover_path, 3600);
    thumbnailUrl = signed?.signedUrl ?? null;
  }
  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/courses"
      description="Edit course details and build the video curriculum."
      title={course.title}
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <CourseDetailManager
        course={{ ...course, thumbnailUrl }}
        groups={groups ?? []}
        lessons={lessons ?? []}
        selectedGroupIds={(grants ?? [])
          .map((grant) => grant.group_id)
          .filter((groupId): groupId is string => Boolean(groupId))}
      />
    </DashboardShell>
  );
}
