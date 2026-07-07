"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SubscriptionRequired } from "@/components/subscription-required";
import type { SubscriptionSummary } from "@/lib/billing-utils";

interface DashboardSubscriptionGateProps {
  isActive: boolean;
  summary: SubscriptionSummary | null;
  children: React.ReactNode;
}

export function DashboardSubscriptionGate({
  isActive,
  summary,
  children,
}: DashboardSubscriptionGateProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (isActive) return <>{children}</>;

  const onBillingSettings =
    pathname === "/dashboard/settings" && searchParams.get("tab") === "billing";

  if (onBillingSettings) return <>{children}</>;

  return <SubscriptionRequired summary={summary} />;
}
