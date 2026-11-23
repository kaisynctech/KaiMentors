import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AcademyJoinPage } from "@/components/academy-join-page";
import { loadAcademyEntryBySlug } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";
import { normalizeReferralCode, referralCookieName } from "@/lib/referral-math";

interface PortalJoinPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}

export async function generateMetadata({
  params,
}: PortalJoinPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadAcademyEntryBySlug(slug);
  return {
    ...portalTitle(data ? `Join ${data.portal.portal_name}` : "Join Academy"),
    description: "Apply for private academy access.",
  };
}

export default async function PortalJoinPage({ params, searchParams }: PortalJoinPageProps) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const data = await loadAcademyEntryBySlug(slug);
  if (!data) notFound();
  const cookieStore = await cookies();
  const referralCode = normalizeReferralCode(
    ref || cookieStore.get(referralCookieName(slug))?.value,
  );
  return <AcademyJoinPage data={data} referralCode={referralCode} />;
}
