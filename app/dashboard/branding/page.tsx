import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { PortalBrandingForm } from "@/components/portal-branding-form";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function AcademyPageSettings() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const [{ data: portal }, { data: riskTemplates }] = await Promise.all([
    workspace.supabase.from("portals").select("*").eq("id", workspace.portal.id).single(),
    workspace.supabase.from("risk_disclosure_templates").select("id,title,message").eq("is_active", true).order("title"),
  ]);
  if (!portal) redirect("/dashboard");
  return (
    <DashboardShell activePath="/dashboard/branding" description="Manage the approved identity and content fields shown on your academy website." title="Academy Page" userLabel={portal.portal_name}>
      <PortalBrandingForm initialPortal={portal} riskTemplates={riskTemplates ?? []} />
    </DashboardShell>
  );
}
