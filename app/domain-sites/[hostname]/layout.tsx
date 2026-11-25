import type { Metadata } from "next";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";

interface AcademyDomainLayoutProps {
  children: React.ReactNode;
  params: Promise<{ hostname: string }>;
}

// Every page on an academy domain sets its own title. The default only shows
// when none is set, which is the page-not-found screen: name the academy
// there, never the platform.
export async function generateMetadata({
  params,
}: Omit<AcademyDomainLayoutProps, "children">): Promise<Metadata> {
  const { hostname } = await params;
  const data = await loadAcademyEntryByHostname(hostname);
  return {
    title: {
      default: data
        ? `Page not found · ${data.portal.portal_name}`
        : "Website unavailable",
      template: "%s",
    },
  };
}

export default function AcademyDomainLayout({
  children,
}: AcademyDomainLayoutProps) {
  return <>{children}</>;
}
