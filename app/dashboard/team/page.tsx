import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name, timezone)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/dashboard");

  const trader = Array.isArray(membership.trader) ? membership.trader[0] : membership.trader;

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("trader_members")
      .select("user_id, role, created_at")
      .eq("trader_id", membership.trader_id)
      .order("created_at"),
    supabase
      .from("workspace_invitations")
      .select("id, email, created_at")
      .eq("trader_id", membership.trader_id)
      .is("accepted_at", null)
      .order("created_at"),
  ]);

  const memberUserIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
    : { data: [] };

  return (
    <DashboardShell
      activePath="/dashboard/team"
      description="Manage the mentors in your workspace."
      title="Team"
      userLabel={trader?.display_name ?? "Workspace"}
    >
      <TeamManager
        callerRole={membership.role as "owner" | "mentor"}
        callerUserId={user.id}
        invitations={invitations ?? []}
        members={(members ?? []).map((m) => ({
          ...m,
          role: m.role as "owner" | "mentor",
        }))}
        profiles={profiles ?? []}
      />
    </DashboardShell>
  );
}
