import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardSubscriptionGate } from "@/components/dashboard-subscription-gate";
import {
  getSubscriptionSummary,
  isAcademyActive,
  isSuperAdminUser,
} from "@/lib/entitlements";
import { getMentorWorkspace } from "@/lib/workspace";
import { portalTitle } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getMentorWorkspace();
  const name = workspace?.portal?.portal_name ?? "Dashboard";
  return portalTitle(name);
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return <>{children}</>;

  const [active, summary, superAdmin] = await Promise.all([
    isAcademyActive(workspace.traderId),
    getSubscriptionSummary(workspace.traderId),
    isSuperAdminUser(),
  ]);

  const isActive = superAdmin || active;

  return (
    <Suspense fallback={<>{children}</>}>
      <DashboardSubscriptionGate isActive={isActive} summary={summary}>
        {children}
      </DashboardSubscriptionGate>
    </Suspense>
  );
}
