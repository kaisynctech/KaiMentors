export type FeatureEntitlementState =
  | "hidden"
  | "preview"
  | "trialing"
  | "active"
  | "expired";

export type SubscriptionSummary = {
  traderId: string;
  planKey: string;
  status: string;
  currency: string;
  monthlyAmountCents: number;
  goLiveAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  billingProvider: string;
  daysLeft: number | null;
  isActive: boolean;
  isGrandfathered: boolean;
};

export function formatZarAmount(cents: number): string {
  return `R${(cents / 100).toFixed(0)}`;
}
