import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademyJoinPage } from "@/components/academy-join-page";
import { loadAcademyEntryBySlug } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

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
  const referralCode = (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return <AcademyJoinPage data={data} referralCode={referralCode} />;
}
