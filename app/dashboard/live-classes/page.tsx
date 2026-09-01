import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveClassManager } from "@/components/live-class-manager";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function LiveClassesPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "live_classes",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }
  const { supabase, traderId, displayName, portal } = workspace;

  const [{ data: classes }, { data: groupRows }, { data: grantRows }] = await Promise.all([
    supabase
      .from("live_classes")
      .select(
        "id,title,description,provider,meeting_id,join_url,starts_at,ends_at,status,room_status,recording_enabled,recording_url,access_scope",
      )
      .eq("trader_id", traderId)
      .order("starts_at", { ascending: false }),
    // MB-124: active groups for the access-scope selector, excluding the
    // auto-created 'all_students' system group (same filter as MB-121).
    supabase
      .from("student_groups")
      .select("id,name,color")
      .eq("trader_id", traderId)
      .eq("is_active", true)
      .is("system_key", null)
      .order("name"),
    supabase
      .from("content_access_grants")
      .select("entity_id, group_id")
      .eq("trader_id", traderId)
      .eq("entity_type", "live_class"),
  ]);

  const grantsByClass = new Map<string, string[]>();
  (grantRows ?? []).forEach((g) => {
    if (!g.group_id) return;
    const existing = grantsByClass.get(g.entity_id) ?? [];
    grantsByClass.set(g.entity_id, [...existing, g.group_id]);
  });
  const classesWithGrants = (classes ?? []).map((c) => ({
    ...c,
    groupIds: grantsByClass.get(c.id) ?? [],
  }));

  return (
    <DashboardShell
      activePath="/dashboard/live-classes"
      description="Schedule and manage live sessions for your students."
      title="Live Classes"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <LiveClassManager classes={classesWithGrants} groups={groupRows ?? []} />
    </DashboardShell>
  );
}
