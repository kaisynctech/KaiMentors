import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Academy",
    template: "%s",
  },
};

export default function DomainSitesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
