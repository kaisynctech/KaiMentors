import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AcademyAuthShell } from "@/components/academy-auth-shell";
import { AccountSetupFlow } from "@/components/account-setup-flow";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

interface CustomDomainAccountSetupPageProps {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata({
  params,
}: CustomDomainAccountSetupPageProps): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) return portalTitle("Account setup");
  return portalTitle(`Account setup · ${data.portal.portal_name}`);
}

export default async function CustomDomainAccountSetupPage({
  params,
}: CustomDomainAccountSetupPageProps) {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) notFound();
  if (data.shouldRedirect && data.canonicalHostname) {
    redirect(`https://${data.canonicalHostname}/account-setup`);
  }

  return (
    <AcademyAuthShell customDomain data={data}>
      <AccountSetupFlow showWorkspaceLink={false} />
    </AcademyAuthShell>
  );
}
