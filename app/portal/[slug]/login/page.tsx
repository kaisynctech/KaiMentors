import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademyLoginPage } from "@/components/academy-login-page";
import { loadAcademyEntryBySlug } from "@/lib/academy-entry";

interface PortalLoginPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PortalLoginPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadAcademyEntryBySlug(slug);
  return {
    title: data ? `Sign In | ${data.portal.portal_name}` : "Academy Sign In",
    description: "Sign in to your private academy.",
  };
}

export default async function PortalLoginPage({ params }: PortalLoginPageProps) {
  const { slug } = await params;
  const data = await loadAcademyEntryBySlug(slug);
  if (!data) notFound();
  return <AcademyLoginPage data={data} />;
}
