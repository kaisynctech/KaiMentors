import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MentorStudentProjects } from "@/components/mentor-student-projects";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import type { StudentProject } from "@/lib/student-projects";
import { getMentorWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MentorProjectsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "projects",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }
  const { supabase, traderId, displayName, portal } = workspace;

  const { data: rows } = await supabase
    .from("student_projects")
    .select(
      "id,title,student_name,description,category,live_url,github_url,thumbnail_url,tools,featured,published,created_at",
    )
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false });

  const projects = (rows ?? []).map((row) => ({
    ...row,
    tools: Array.isArray(row.tools) ? row.tools : [],
  })) as StudentProject[];

  return (
    <DashboardShell
      activePath="/dashboard/projects"
      description="Showcase student work on this academy’s public site and student portal."
      title="Projects"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <MentorStudentProjects projects={projects} />
    </DashboardShell>
  );
}
