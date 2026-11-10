import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReferralAccountPage } from "@/components/referral-account-page";
import { portalTitle } from "@/lib/metadata";

interface PortalReferralsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return portalTitle("Referrals");
}

export default async function PortalReferralsPage({ params }: PortalReferralsPageProps) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) notFound();
  return (
    <ReferralAccountPage
      joinPath={`/portal/${slug}/join-academy`}
      loginPath={`/portal/${slug}/login?next=${encodeURIComponent(`/portal/${slug}/referrals`)}`}
      portalSlug={slug}
    />
  );
}
