import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademyJoinPage } from "@/components/academy-join-page";
import { loadAcademyEntryBySlug } from "@/lib/academy-entry";

interface PortalJoinPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PortalJoinPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadAcademyEntryBySlug(slug);
  return {
    title: data ? `Join ${data.portal.portal_name}` : "Join Academy",
    description: "Apply for private academy access.",
  };
}

export default async function PortalJoinPage({ params }: PortalJoinPageProps) {
  const { slug } = await params;
  const data = await loadAcademyEntryBySlug(slug);
  if (!data) notFound();
  return <AcademyJoinPage data={data} />;
}
