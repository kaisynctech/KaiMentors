import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AcademyJoinPage } from "@/components/academy-join-page";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";
import { normalizeReferralCode, referralCookieName } from "@/lib/referral-math";

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
  const cookieStore = await cookies();
  const referralCode = normalizeReferralCode(
    ref || cookieStore.get(referralCookieName(data.portal.slug))?.value,
  );
  if (data.shouldRedirect && data.canonicalHostname) {
    const suffix = referralCode ? `?ref=${referralCode}` : "";
    redirect(`https://${data.canonicalHostname}/join-academy${suffix}`);
  }
  return <AcademyJoinPage customDomain data={data} referralCode={referralCode} />;
}
