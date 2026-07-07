import type { SubscriptionSummary } from "@/lib/billing-utils";
import { formatZarAmount } from "@/lib/billing-utils";

interface MentorBillingPanelProps {
  summary: SubscriptionSummary;
  eftInstructions: string | null;
}

export function MentorBillingPanel({ summary, eftInstructions }: MentorBillingPanelProps) {
  const amount = formatZarAmount(summary.monthlyAmountCents);
  const countdownLabel =
    summary.status === "active" ? "Next billing date" : "Trial ends";
  const countdownDate =
    summary.status === "active"
      ? summary.currentPeriodEndsAt
      : summary.trialEndsAt;

  return (
    <section>
      <header style={{ marginBottom: "1.25rem" }}>
        <p className="eyebrow">Billing</p>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
          KaiMentors Standard
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          {amount}/month — all platform features included.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          padding: "1rem",
          borderRadius: "0.85rem",
          border: "1px solid var(--border)",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Status</span>
          <strong style={{ textTransform: "capitalize" }}>{summary.status.replace(/_/g, " ")}</strong>
        </div>
        {summary.isGrandfathered ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#047857" }}>
            Your workspace is included free until 31 July 2026.
          </p>
        ) : null}
        {summary.isActive && summary.daysLeft !== null ? (
          <p style={{ margin: 0, fontSize: "0.88rem" }}>
            {summary.status === "trialing" ? "Trial" : "Billing period"}:{" "}
            <strong>{summary.daysLeft} days left</strong>
            {countdownDate
              ? ` (ends ${new Date(countdownDate).toLocaleDateString()})`
              : ""}
          </p>
        ) : null}
        {!summary.isActive ? (
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Your subscription is inactive. Renew for {amount}/month to restore your academy
            and student access.
          </p>
        ) : summary.status === "trialing" ? (
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Your academy is fully active during your trial.
          </p>
        ) : null}
        {countdownDate ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {countdownLabel}
            </span>
            <span>{new Date(countdownDate).toLocaleDateString()}</span>
          </div>
        ) : null}
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 700 }}>
          Pay {amount}/month
        </h3>
        {eftInstructions ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              padding: "1rem",
              borderRadius: "0.75rem",
              background: "var(--surface-hover, #f8fafc)",
              border: "1px solid var(--border)",
              margin: 0,
            }}
          >
            {eftInstructions}
          </pre>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>
            Contact KaiMentors support to arrange EFT payment. Once paid, your workspace will
            be marked active by our team.
          </p>
        )}
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: 0 }}>
        Card payments via Paystack are coming soon.
      </p>
    </section>
  );
}
