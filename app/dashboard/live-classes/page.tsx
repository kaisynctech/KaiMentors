import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveClassManager } from "@/components/live-class-manager";
import { createClient } from "@/lib/supabase/server";

export default async function LiveClassesPage() {
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

  const { data: classes } = await supabase
    .from("live_classes")
    .select(
      "id,title,description,provider,meeting_id,join_url,starts_at,ends_at,status,room_status,recording_enabled,recording_url",
    )
    .eq("trader_id", membership.trader_id)
    .order("starts_at", { ascending: false });

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/live-classes"
      description="Schedule and manage live sessions for your students."
      title="Live Classes"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <LiveClassManager classes={classes ?? []} />
    </DashboardShell>
  );
}
