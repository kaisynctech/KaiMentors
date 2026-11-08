export const PLAN_IDS = ["library", "scholar", "studio"] as const;

export const SUBSCRIPTION_PLANS = [
  {
    id: "library" as const,
    label: "Library",
    amountZAR: 99,
    amountCents: 9900,
    description: "All recorded courses, AI tools directory, community, and business classes — self-paced.",
    features: [
      "Full access to all recorded courses",
      "AI Tools directory",
      "Community, resources, and business classes",
      "Self-paced learning",
    ],
    liveSeatsPerMonth: 0,
    clinicReportsPerMonth: 0,
    popular: false,
  },
  {
    id: "scholar" as const,
    label: "Scholar",
    amountZAR: 149,
    amountCents: 14900,
    description: "Everything in Library plus one live lab and one marked assignment each month.",
    features: [
      "Everything in Library",
      "1 live lab seat per month",
      "1 marked assignment per month",
    ],
    liveSeatsPerMonth: 1,
    clinicReportsPerMonth: 1,
    popular: true,
  },
  {
    id: "studio" as const,
    label: "Studio",
    amountZAR: 249,
    amountCents: 24900,
    description: "Everything in Scholar plus two live labs and three project clinic reports each month.",
    features: [
      "Everything in Scholar",
      "2 live lab seats per month",
      "3 project clinic reports per month",
    ],
    liveSeatsPerMonth: 2,
    clinicReportsPerMonth: 3,
    popular: false,
  },
] as const;

export type PlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];

export function getPlanById(planId: string) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ?? null;
}
