import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { SettingsTabs } from "@/components/settings-tabs";
import { getMentorWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");

  const supabase = workspace.supabase;

  const { data: membership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("trader_id", workspace.traderId)
    .eq("user_id", workspace.user.id)
    .maybeSingle();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("trader_members")
      .select("user_id, role, created_at")
      .eq("trader_id", workspace.traderId)
      .order("created_at"),
    supabase
      .from("workspace_invitations")
      .select("id, email, created_at")
      .eq("trader_id", workspace.traderId)
      .is("accepted_at", null)
      .order("created_at"),
  ]);

  const memberUserIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
    : { data: [] };

  return (
    <DashboardShell
      activePath="/dashboard/settings"
      description="Manage workspace security, identity, and team members."
      title="Settings"
      userLabel={workspace.portal.portal_name}
    >
      <SettingsTabs
        callerRole={membership?.role ?? "mentor"}
        callerUserId={workspace.user.id}
        currentEmail={workspace.user.email ?? ""}
        invitations={invitations ?? []}
        members={members ?? []}
        profiles={profiles ?? []}
      />
    </DashboardShell>
  );
}
