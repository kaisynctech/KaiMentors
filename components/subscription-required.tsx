import Link from "next/link";
import type { SubscriptionSummary } from "@/lib/billing-utils";
import { formatZarAmount } from "@/lib/billing-utils";

interface SubscriptionRequiredProps {
  summary: SubscriptionSummary | null;
}

export function SubscriptionRequired({ summary }: SubscriptionRequiredProps) {
  const amount = summary ? formatZarAmount(summary.monthlyAmountCents) : "R400";

  return (
    <section
      style={{
        maxWidth: "32rem",
        margin: "4rem auto",
        padding: "2rem",
        borderRadius: "1rem",
        border: "1px solid var(--border)",
        background: "var(--surface, #fff)",
        textAlign: "center",
      }}
    >
      <p className="eyebrow">Subscription required</p>
      <h1 style={{ margin: "0.5rem 0 1rem", fontSize: "1.5rem", fontWeight: 800 }}>
        Your academy is paused
      </h1>
      <p style={{ color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
        Your subscription is inactive. Renew for <strong>{amount}/month</strong> to restore
        your academy and student access.
      </p>
      <Link
        href="/dashboard/settings?tab=billing"
        style={{
          display: "inline-block",
          padding: "0.75rem 1.25rem",
          borderRadius: "999px",
          background: "var(--accent, #111)",
          color: "#fff",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        View billing
      </Link>
    </section>
  );
}
