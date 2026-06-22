import { notFound, redirect } from "next/navigation";
import { AcademyLoginPage } from "@/components/academy-login-page";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";

interface CustomDomainLoginPageProps {
  params: Promise<{ hostname: string }>;
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
