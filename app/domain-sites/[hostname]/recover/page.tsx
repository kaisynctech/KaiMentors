import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AcademyAuthShell } from "@/components/academy-auth-shell";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

interface CustomDomainRecoverPageProps {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata({
  params,
}: CustomDomainRecoverPageProps): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) return portalTitle("Forgot password");
  return portalTitle(`Forgot password · ${data.portal.portal_name}`);
}

export default async function CustomDomainRecoverPage({
  params,
}: CustomDomainRecoverPageProps) {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) notFound();
  if (data.shouldRedirect && data.canonicalHostname) {
    redirect(`https://${data.canonicalHostname}/recover`);
  }

  return (
    <AcademyAuthShell customDomain data={data}>
      <PasswordRecoveryForm />
    </AcademyAuthShell>
  );
}
