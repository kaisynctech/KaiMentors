import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AcademyLoginPage } from "@/components/academy-login-page";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

interface CustomDomainLoginPageProps {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata({
  params,
}: CustomDomainLoginPageProps): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) return portalTitle("Sign In");
  return portalTitle(`Sign In · ${data.portal.portal_name}`);
}

export default async function CustomDomainLoginPage({
  params,
}: CustomDomainLoginPageProps) {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) notFound();
  if (data.shouldRedirect && data.canonicalHostname) {
    redirect(`https://${data.canonicalHostname}/login`);
  }

  return <AcademyLoginPage customDomain data={data} />;
}
