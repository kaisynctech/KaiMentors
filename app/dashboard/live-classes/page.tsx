import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveClassManager } from "@/components/live-class-manager";
import { academyCanConnectGoogleMeet } from "@/lib/academy-charts";
import { googleOAuthConfigured } from "@/lib/google-meet";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";

function googleNotice(status?: string, reason?: string) {
  if (status === "connected") {
    return "Google account connected. You can create a Meet link when you schedule a class, or paste one.";
  }
  if (status === "disconnected") {
    return "Google account disconnected. Pasted Meet links still work.";
  }
  if (status !== "error") return null;
  if (reason === "denied") return "Google connection was cancelled.";
  if (reason === "not_configured") {
    return "Google Meet creation is not configured yet. Paste a Meet link instead.";
  }
  if (reason === "no_refresh") {
    return "Google did not grant offline access. Remove this app in the Google account's security settings and connect again.";
  }
  return "Google could not be connected. Paste a Meet link, or try connecting again.";
}

export default async function LiveClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ google?: string; reason?: string }>;
}) {
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
  const { supabase, traderId, displayName, portal, studentPortalFeatures } = workspace;
  const query = await searchParams;
  const googleMeetEnabled = academyCanConnectGoogleMeet(studentPortalFeatures);
  let googleEmail: string | null = null;
  let googleConnected = false;
  if (googleMeetEnabled) {
    const { data: connection } = await supabase
      .from("academy_integrations")
      .select("external_email")
      .eq("trader_id", traderId)
      .eq("provider", "google_calendar")
      .maybeSingle();
    googleConnected = Boolean(connection);
    googleEmail = connection?.external_email ?? null;
  }

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
      <LiveClassManager
        classes={classesWithGrants}
        googleMeet={
          googleMeetEnabled
            ? {
                enabled: true,
                configured: googleOAuthConfigured(),
                connected: googleConnected,
                email: googleEmail,
                notice: googleNotice(query?.google, query?.reason),
              }
            : undefined
        }
        groups={groupRows ?? []}
      />
    </DashboardShell>
  );
}
