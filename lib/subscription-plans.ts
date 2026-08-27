export const SUBSCRIPTION_PLANS = [
  {
    id: "basic" as const,
    label: "Basic",
    amountZAR: 250,
    amountCents: 25000,
    description: "Full course access, AI Tools directory, community, self-paced learning",
    features: ["Full access to all courses", "AI Tools directory", "Community access", "Self-paced learning"],
    popular: false,
  },
  {
    id: "intermediate" as const,
    label: "Intermediate",
    amountZAR: 400,
    amountCents: 40000,
    description: "Everything in Basic plus live classes and project workshops",
    features: ["Everything in Basic", "Live classes", "Group sessions", "Project workshops"],
    popular: true,
  },
  {
    id: "pro" as const,
    label: "Pro",
    amountZAR: 700,
    amountCents: 70000,
    description: "Everything in Intermediate plus one-on-one mentorship",
    features: ["Everything in Intermediate", "One-on-one mentorship bookings", "Priority support", "Early access to new content"],
    popular: false,
  },
] as const;

export type PlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];

export function getPlanById(planId: string) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ?? null;
}
