import { redirect } from "next/navigation";
import { CustomSiteManager } from "@/components/custom-site-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { WebsiteBuilderNavigation } from "@/components/website-builder-navigation";
import type {
  CustomSiteAssignment,
  CustomSitePackage,
  WebsiteDeliveryMode,
} from "@/lib/custom-sites";
import { getMentorWorkspace } from "@/lib/workspace";

interface AssignmentRow extends CustomSiteAssignment {
  package?: CustomSitePackage | CustomSitePackage[] | null;
}

function normalizePackage(sitePackage: CustomSitePackage): CustomSitePackage {
  return {
    ...sitePackage,
    editable_schema: Array.isArray(sitePackage.editable_schema)
      ? sitePackage.editable_schema
      : [],
    reserved_paths: Array.isArray(sitePackage.reserved_paths)
      ? sitePackage.reserved_paths
      : [],
  };
}

export default async function CustomWebsitePackagesPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");

  const [portalResult, packagesResult, assignmentResult] = await Promise.all([
    workspace.supabase
      .from("portals")
      .select("website_delivery_mode")
      .eq("id", workspace.portal.id)
      .maybeSingle(),
    workspace.supabase
      .from("custom_site_packages")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("name"),
    workspace.supabase
      .from("custom_site_assignments")
      .select("*,package:custom_site_packages(*)")
      .eq("portal_id", workspace.portal.id)
      .maybeSingle(),
  ]);

  const trader = Array.isArray(workspace.membership.trader)
    ? workspace.membership.trader[0]
    : workspace.membership.trader;
  const assignmentRow = assignmentResult.data as AssignmentRow | null;
  const assignment = assignmentRow
    ? ({
        id: assignmentRow.id,
        trader_id: assignmentRow.trader_id,
        portal_id: assignmentRow.portal_id,
        package_id: assignmentRow.package_id,
        status: assignmentRow.status,
        content_overrides: assignmentRow.content_overrides ?? {},
        show_powered_by: assignmentRow.show_powered_by,
        assigned_by: assignmentRow.assigned_by,
        activated_at: assignmentRow.activated_at,
      } satisfies CustomSiteAssignment)
    : null;

  return (
    <DashboardShell
      activePath="/dashboard/website-builder"
      description="Assign bespoke client websites while keeping KaiMentors as the tenant, auth, portal, and course engine."
      title="Custom Website Packages"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <WebsiteBuilderNavigation active="custom-sites" />
      <CustomSiteManager
        assignment={assignment}
        deliveryMode={
          ((portalResult.data?.website_delivery_mode ??
            "builder_template") as WebsiteDeliveryMode)
        }
        packages={((packagesResult.data ?? []) as CustomSitePackage[]).map(
          normalizePackage,
        )}
        portalSlug={workspace.portal.slug}
      />
    </DashboardShell>
  );
}
