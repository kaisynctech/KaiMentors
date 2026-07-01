import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { StudentGroupManager } from "@/components/student-group-manager";
import type {
  CommunityStudent,
  StudentGroupSummary,
} from "@/lib/community";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function StudentGroupsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const [{ data: groupRows }, { data: applicationRows }] = await Promise.all([
    supabase
      .from("student_groups")
      .select(
        "id,name,description,color,is_active,system_key,members:student_group_members(application_id),conversations(id)",
      )
      .eq("trader_id", traderId)
      .order("system_key", { ascending: false })
      .order("created_at"),
    supabase
      .from("student_applications")
      .select(
        "id,student_user_id,profile:profiles!student_user_id(full_name,email)",
      )
      .eq("trader_id", traderId)
      .eq("status", "verified")
      .order("submitted_at", { ascending: false }),
  ]);

  const groups: StudentGroupSummary[] = (groupRows ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    isActive: group.is_active,
    isSystem: group.system_key === "all_students",
    memberIds: (group.members ?? []).map((member) => member.application_id),
    conversationId: group.conversations?.[0]?.id ?? null,
  }));
  const students: CommunityStudent[] = (applicationRows ?? []).map(
    (application) => {
      const profile = Array.isArray(application.profile)
        ? application.profile[0] ?? null
        : application.profile;
      return {
        applicationId: application.id,
        userId: application.student_user_id,
        fullName: profile?.full_name ?? "Student",
        email: profile?.email ?? null,
      };
    },
  );
  return (
    <DashboardShell
      activePath="/dashboard/groups"
      description="Organize cohorts, service levels, and private learning audiences."
      title="Student Groups"
      userLabel={displayName}
    >
      <StudentGroupManager groups={groups} students={students} />
    </DashboardShell>
  );
}
