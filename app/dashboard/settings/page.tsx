import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { OwnerEmailChangeForm } from "@/components/owner-email-change-form";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function WorkspaceSettingsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { data: membership } = await workspace.supabase.from("trader_members").select("role").eq("trader_id", workspace.traderId).eq("user_id", workspace.user.id).maybeSingle();
  return <DashboardShell activePath="/dashboard/settings" description="Manage workspace account security and verified identity settings." title="Settings" userLabel={workspace.portal.portal_name}>{membership?.role === "owner" && workspace.user.email ? <OwnerEmailChangeForm currentEmail={workspace.user.email} /> : <p>Only the workspace owner can change the account email.</p>}</DashboardShell>;
}
