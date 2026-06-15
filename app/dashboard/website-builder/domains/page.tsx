import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { WebsiteBuilderNavigation } from "@/components/website-builder-navigation";
import { WebsiteDomainManager } from "@/components/website-domain-manager";
import type { WebsiteDomain } from "@/lib/domains/types";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function WebsiteDomainsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");

  const [domainsResult, releasesResult, eventsResult] = await Promise.all([
    workspace.supabase
      .from("website_domains")
      .select("*")
      .eq("portal_id", workspace.portal.id)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    workspace.supabase
      .from("website_releases")
      .select(
        "id,version,status,content_hash,release_notes,published_at,published_by",
      )
      .eq("portal_id", workspace.portal.id)
      .order("version", { ascending: false }),
    workspace.supabase
      .from("website_domain_events")
      .select(
        "id,domain_id,event_type,hostname,previous_status,next_status,details,created_at",
      )
      .eq("portal_id", workspace.portal.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const trader = Array.isArray(workspace.membership.trader)
    ? workspace.membership.trader[0]
    : workspace.membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/website-builder"
      description="Connect verified custom domains and control exactly which website release is live."
      title="Website Domains"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <WebsiteBuilderNavigation active="domains" />
      <WebsiteDomainManager
        domains={(domainsResult.data ?? []) as WebsiteDomain[]}
        events={(eventsResult.data ?? [])}
        portalSlug={workspace.portal.slug}
        releases={(releasesResult.data ?? [])}
      />
    </DashboardShell>
  );
}
