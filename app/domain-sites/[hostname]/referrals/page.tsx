import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReferralAccountPage } from "@/components/referral-account-page";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

interface DomainReferralsPageProps {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return portalTitle("Referrals");
}

export default async function DomainReferralsPage({ params }: DomainReferralsPageProps) {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  if (!data) notFound();
  if (data.shouldRedirect && data.canonicalHostname) {
    redirect(`https://${data.canonicalHostname}/referrals`);
  }
  return (
    <ReferralAccountPage
      joinPath="/join-academy"
      loginPath={`/login?next=${encodeURIComponent("/referrals")}`}
      portalSlug={data.portal.slug}
    />
  );
}
