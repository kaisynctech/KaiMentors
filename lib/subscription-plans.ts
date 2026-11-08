export const PLAN_IDS = ["library", "scholar", "studio"] as const;

export const SUBSCRIPTION_PLANS = [
  {
    id: "library" as const,
    label: "Library",
    amountZAR: 99,
    amountCents: 9900,
    description:
      "All recorded courses, two AI seminars a week, AI tools, and community. Extra 1:1 is R49 per 45 minutes.",
    features: [
      "Full access to all recorded courses",
      "2 AI seminars a week",
      "AI Tools directory",
      "Community and resources",
      "1:1 at R49 / 45 min — submit your problem when you book",
    ],
    freeOneToOnePerMonth: 0,
    oneToOnePriceZAR: 49,
    sundayBusinessSeminar: false,
    popular: false,
  },
  {
    id: "scholar" as const,
    label: "Scholar",
    amountZAR: 149,
    amountCents: 14900,
    description: "Everything in Library plus one marked assignment each month.",
    features: [
      "Everything in Library",
      "1 marked assignment per month",
    ],
    freeOneToOnePerMonth: 0,
    oneToOnePriceZAR: 49,
    sundayBusinessSeminar: false,
    popular: true,
  },
  {
    id: "studio" as const,
    label: "Studio",
    amountZAR: 249,
    amountCents: 24900,
    description:
      "Everything in Scholar plus the Sunday business seminar, one free 45-minute 1:1 each month, and eligibility for the public showcase.",
    features: [
      "Everything in Scholar",
      "Sunday business seminar",
      "1 free 45-min 1:1 per month",
      "Extra 1:1 at R49 / 45 min",
      "Eligible for the public showcase — up to 2 featured projects a month",
    ],
    freeOneToOnePerMonth: 1,
    oneToOnePriceZAR: 49,
    sundayBusinessSeminar: true,
    popular: false,
  },
] as const;

export type PlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];

export function getPlanById(planId: string) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ?? null;
}
