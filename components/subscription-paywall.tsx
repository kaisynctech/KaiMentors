"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SUBSCRIPTION_PLANS, type PlanId } from "@/lib/subscription-plans";
import styles from "./subscription-paywall.module.css";

interface SubscriptionPaywallProps {
  portalSlug: string;
  justSubscribed?: boolean;
  justCancelled?: boolean;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 60000;

export function SubscriptionPaywall({
  portalSlug,
  justSubscribed = false,
  justCancelled = false,
}: SubscriptionPaywallProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(justSubscribed);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [actionUrl, setActionUrl] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!polling) return;
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += POLL_INTERVAL_MS;
      try {
        const res = await fetch(
          `/api/student/subscription-status?portal=${encodeURIComponent(portalSlug)}`,
          { signal: AbortSignal.timeout(20000) },
        );
        const data = await res.json();
        if (data.status === "active") {
          clearInterval(interval);
          window.location.reload();
          return;
        }
      } catch {
        // transient error — keep polling until the timeout below
      }
      if (elapsed >= POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setPolling(false);
        setPollTimedOut(true);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [polling, portalSlug]);

  // Submitting the hidden form must wait until the fields it needs have actually
  // committed to the DOM (a following useEffect run), not fire in the same tick as the
  // setState calls that populate them.
  useEffect(() => {
    if (pendingSubmit && actionUrl && Object.keys(formFields).length > 0) {
      formRef.current?.submit();
      setPendingSubmit(false);
    }
  }, [pendingSubmit, actionUrl, formFields]);

  async function handleSubscribe(planId: PlanId) {
    setLoadingPlan(planId);
    setError("");
    try {
      const response = await fetch("/api/student/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, portalSlug }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start checkout.");
      setFormFields(data.fields);
      setActionUrl(data.actionUrl);
      setPendingSubmit(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className={styles.wrap}>
      {polling ? (
        <div className={styles.banner} role="status">
          <Loader2 className={styles.spin} size={18} />
          <span>
            Payment received — your access is being activated. This can take up to a
            minute…
          </span>
        </div>
      ) : null}
      {pollTimedOut ? (
        <div className={styles.bannerNeutral} role="status">
          <span>
            Still confirming your payment. If this doesn&apos;t update in a few minutes,
            refresh the page or contact support.
          </span>
        </div>
      ) : null}
      {justCancelled && !justSubscribed ? (
        <div className={styles.bannerNeutral} role="status">
          <span>Checkout was cancelled. No charge was made — pick a plan below whenever you&apos;re ready.</span>
        </div>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        {SUBSCRIPTION_PLANS.map((plan) => (
          <div
            className={`${styles.card} ${plan.popular ? styles.popular : ""}`}
            key={plan.id}
          >
            {plan.popular ? <span className={styles.badge}>Most Popular</span> : null}
            <div className={styles.planName}>{plan.label}</div>
            <div className={styles.price}>
              R{plan.amountZAR}
              <span>/month</span>
            </div>
            <p className={styles.desc}>{plan.description}</p>
            <ul className={styles.features}>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <CheckCircle2 size={15} />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              className={styles.subscribeBtn}
              disabled={loadingPlan !== null}
              onClick={() => handleSubscribe(plan.id)}
              type="button"
            >
              {loadingPlan === plan.id ? <Loader2 className={styles.spin} size={16} /> : null}
              Subscribe – {plan.label}
            </button>
          </div>
        ))}
      </div>

      <form action={actionUrl} method="POST" ref={formRef} style={{ display: "none" }}>
        {Object.entries(formFields).map(([key, value]) => (
          <input key={key} name={key} type="hidden" value={value} />
        ))}
      </form>
    </div>
  );
}
