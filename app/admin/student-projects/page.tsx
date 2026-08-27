import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { AdminStudentProjects } from "@/components/admin-student-projects";

export default async function StudentProjectsPage() {
  const { supabase, userLabel } = await requirePlatformAdmin();

  const { data: projects } = await supabase
    .from("student_projects")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <DashboardShell
      activePath="/admin/student-projects"
      description="Post and manage KSI student project showcases visible on the public website."
      mode="admin"
      title="Student Projects"
      userLabel={userLabel}
    >
      <AdminStudentProjects projects={projects ?? []} />
    </DashboardShell>
  );
}
