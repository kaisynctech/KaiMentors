"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { getPlanById } from "@/lib/subscription-plans";
import styles from "./my-subscription-card.module.css";

interface MySubscriptionCardProps {
  planId: string;
  currentPeriodEnd: string | null;
}

export function MySubscriptionCard({ planId, currentPeriodEnd }: MySubscriptionCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelledUntil, setCancelledUntil] = useState<string | null>(null);

  const plan = getPlanById(planId);
  const formattedDate = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: "long" })
    : null;

  async function handleCancel() {
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of your current billing period.")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/student/cancel-subscription", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not cancel subscription.");
      setCancelledUntil(data.currentPeriodEnd ?? currentPeriodEnd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel subscription.");
    } finally {
      setLoading(false);
    }
  }

  if (cancelledUntil) {
    const cancelledDate = new Date(cancelledUntil).toLocaleDateString(undefined, {
      dateStyle: "long",
    });
    return (
      <div className={styles.card}>
        <p className={styles.title}>Cancellation confirmed.</p>
        <p className={styles.body}>Access continues until {cancelledDate}.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div>
        <p className={styles.eyebrow}>My subscription</p>
        <p className={styles.planName}>{plan?.label ?? planId}</p>
        {plan ? <p className={styles.price}>R{plan.amountZAR}/month</p> : null}
        {formattedDate ? (
          <p className={styles.body}>Next billing date: {formattedDate}</p>
        ) : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <button className={styles.cancelBtn} disabled={loading} onClick={handleCancel} type="button">
        {loading ? <Loader2 className={styles.spin} size={14} /> : null}
        Cancel subscription
      </button>
    </div>
  );
}
