import type { Metadata } from "next";
import { getMentorWorkspace } from "@/lib/workspace";
import { portalTitle } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getMentorWorkspace();
  const name = workspace?.portal?.portal_name ?? "Dashboard";
  return portalTitle(name);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
