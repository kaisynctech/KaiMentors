import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AcademyJoinPage } from "@/components/academy-join-page";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";

interface CustomDomainJoinPageProps {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata({
  params,
}: CustomDomainJoinPageProps): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  return {
    title: data ? `Join ${data.portal.portal_name}` : "Join Academy",
    description: "Apply for private academy access.",
    alternates: data?.canonicalHostname
      ? { canonical: `https://${data.canonicalHostname}/join-academy` }
      : undefined,
  };
}

export default async function CustomDomainJoinPage({
  params,
}: CustomDomainJoinPageProps) {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) notFound();
  if (data.shouldRedirect && data.canonicalHostname) {
    redirect(`https://${data.canonicalHostname}/join-academy`);
  }
  return <AcademyJoinPage customDomain data={data} />;
}
