import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AcademyJoinPage } from "@/components/academy-join-page";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

interface CustomDomainJoinPageProps {
  params: Promise<{ hostname: string }>;
  searchParams: Promise<{ ref?: string }>;
}

export async function generateMetadata({
  params,
}: CustomDomainJoinPageProps): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  return {
    ...portalTitle(data ? `Join ${data.portal.portal_name}` : "Join Academy"),
    description: "Apply for private academy access.",
    alternates: data?.canonicalHostname
      ? { canonical: `https://${data.canonicalHostname}/join-academy` }
      : undefined,
  };
}

export default async function CustomDomainJoinPage({
  params,
  searchParams,
}: CustomDomainJoinPageProps) {
  const { hostname } = await params;
  const { ref } = await searchParams;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) notFound();
  const referralCode = (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  if (data.shouldRedirect && data.canonicalHostname) {
    const suffix = referralCode ? `?ref=${referralCode}` : "";
    redirect(`https://${data.canonicalHostname}/join-academy${suffix}`);
  }
  return <AcademyJoinPage customDomain data={data} referralCode={referralCode} />;
}
