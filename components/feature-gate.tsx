"use client";

import type { FeatureEntitlementState } from "@/lib/billing-utils";

interface FeatureGateProps {
  featureKey: string;
  featureName: string;
  description?: string;
  state: FeatureEntitlementState;
  addonPriceLabel?: string;
  children: React.ReactNode;
}

export function FeatureGate({
  featureKey,
  featureName,
  description,
  state,
  addonPriceLabel,
  children,
}: FeatureGateProps) {
  if (state === "hidden") return null;

  if (state === "trialing" || state === "active") {
    return <>{children}</>;
  }

  return (
    <section
      data-feature={featureKey}
      style={{
        padding: "1.25rem",
        borderRadius: "0.85rem",
        border: "1px dashed var(--border)",
        background: "var(--surface-hover, #f8fafc)",
      }}
    >
      <p className="eyebrow">Premium feature</p>
      <h3 style={{ margin: "0.25rem 0 0.5rem", fontSize: "1rem", fontWeight: 800 }}>
        {featureName}
      </h3>
      {description ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "0.75rem" }}>
          {description}
        </p>
      ) : null}
      {addonPriceLabel ? (
        <p style={{ fontWeight: 700, marginBottom: "0.75rem" }}>{addonPriceLabel}</p>
      ) : null}
      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: 0 }}>
        {state === "expired"
          ? "Your trial has ended. Contact support to unlock this feature."
          : "This feature is available as a future add-on. Check back soon."}
      </p>
    </section>
  );
}
