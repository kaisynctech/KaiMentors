import { redirect } from "next/navigation";
import { AdminCustomSiteManager } from "@/components/admin-custom-site-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import type {
  CustomSiteAssignment,
  CustomSitePackage,
  WebsiteDeliveryMode,
} from "@/lib/custom-sites";
import { createClient } from "@/lib/supabase/server";

interface TraderRow {
  id: string;
  display_name: string;
  legal_name: string;
  status: string;
}

interface PortalRow {
  id: string;
  trader_id: string;
  portal_name: string;
  slug: string;
  website_delivery_mode: WebsiteDeliveryMode;
}

interface AssignmentRow extends CustomSiteAssignment {
  package: CustomSitePackage | CustomSitePackage[] | null;
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

export default async function AdminCustomSitesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") redirect("/dashboard");

  const [tradersResult, portalsResult, packagesResult, assignmentsResult, studentsResult] =
    await Promise.all([
      supabase
        .from("traders")
        .select("id,display_name,legal_name,status")
        .order("created_at", { ascending: false }),
      supabase
        .from("portals")
        .select("id,trader_id,portal_name,slug,website_delivery_mode")
        .order("created_at", { ascending: false }),
      supabase
        .from("custom_site_packages")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("name"),
      supabase
        .from("custom_site_assignments")
        .select("*,package:custom_site_packages(*)"),
      supabase.from("student_applications").select("trader_id"),
    ]);

  const traders = (tradersResult.data ?? []) as TraderRow[];
  const portals = (portalsResult.data ?? []) as PortalRow[];
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const studentCounts = new Map<string, number>();
  (studentsResult.data ?? []).forEach((row) => {
    const traderId = (row as { trader_id: string }).trader_id;
    studentCounts.set(traderId, (studentCounts.get(traderId) ?? 0) + 1);
  });

  const tenantRows = portals.map((portal) => {
    const trader = traders.find((entry) => entry.id === portal.trader_id);
    const assignment = assignments.find((entry) => entry.portal_id === portal.id);
    const sitePackage = assignment?.package
      ? Array.isArray(assignment.package)
        ? assignment.package[0]
        : assignment.package
      : null;
    return {
      traderId: portal.trader_id,
      portalId: portal.id,
      mentorName: trader?.display_name ?? trader?.legal_name ?? "Unknown mentor",
      portalName: portal.portal_name,
      portalSlug: portal.slug,
      studentCount: studentCounts.get(portal.trader_id) ?? 0,
      deliveryMode: portal.website_delivery_mode,
      assignmentId: assignment?.id ?? null,
      packageId: assignment?.package_id ?? null,
      packageName: sitePackage?.name ?? null,
      assignmentStatus: assignment?.status ?? null,
      showPoweredBy: assignment?.show_powered_by ?? true,
    };
  });

  return (
    <DashboardShell
      activePath="/admin/custom-sites"
      description="Assign bespoke website packages to the correct mentor tenant and keep ownership controlled by KaiMentors."
      mode="admin"
      title="Custom Site Assignments"
      userLabel={profile.full_name || "Super Admin"}
    >
      <AdminCustomSiteManager
        packages={((packagesResult.data ?? []) as CustomSitePackage[]).map(
          normalizePackage,
        )}
        tenants={tenantRows}
      />
    </DashboardShell>
  );
}
