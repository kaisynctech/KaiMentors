import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveClassManager } from "@/components/live-class-manager";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function LiveClassesPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const { data: classes } = await supabase
    .from("live_classes")
    .select(
      "id,title,description,provider,meeting_id,join_url,starts_at,ends_at,status,room_status,recording_enabled,recording_url",
    )
    .eq("trader_id", traderId)
    .order("starts_at", { ascending: false });

  return (
    <DashboardShell
      activePath="/dashboard/live-classes"
      description="Schedule and manage live sessions for your students."
      title="Live Classes"
      userLabel={displayName}
    >
      <LiveClassManager classes={classes ?? []} />
    </DashboardShell>
  );
}
