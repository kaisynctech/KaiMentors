"use client";

import { useState } from "react";

interface AdminBillingControlsProps {
  traderId: string;
  traderName: string;
  initial: {
    status: string;
    trialEndsAt: string | null;
    goLiveAt: string | null;
    currentPeriodEndsAt: string | null;
    isGrandfathered: boolean;
  };
}

export function AdminBillingControls({
  traderId,
  traderName,
  initial,
}: AdminBillingControlsProps) {
  const [status, setStatus] = useState(initial.status);
  const [trialEndsAt, setTrialEndsAt] = useState(initial.trialEndsAt);
  const [goLiveAt, setGoLiveAt] = useState(initial.goLiveAt);
  const [currentPeriodEndsAt, setCurrentPeriodEndsAt] = useState(
    initial.currentPeriodEndsAt,
  );
  const [extendDays, setExtendDays] = useState("30");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function runAction(
    action: "mark_paid" | "extend_trial" | "set_go_live" | "suspend",
    extra?: Record<string, unknown>,
  ) {
    setLoading(action);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${traderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Billing action failed.");
      }
      if (payload.subscription) {
        setStatus(payload.subscription.status);
        setTrialEndsAt(payload.subscription.trialEndsAt ?? null);
        setGoLiveAt(payload.subscription.goLiveAt ?? null);
        setCurrentPeriodEndsAt(payload.subscription.currentPeriodEndsAt ?? null);
      }
      setMessage(payload.message ?? "Updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing action failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <header>
        <p className="eyebrow">Billing & access</p>
        <h2 style={{ margin: "0.25rem 0", fontSize: "1.2rem", fontWeight: 800 }}>
          {traderName}
        </h2>
        {initial.isGrandfathered ? (
          <span
            style={{
              display: "inline-block",
              marginTop: "0.35rem",
              padding: "0.15rem 0.55rem",
              borderRadius: "999px",
              background: "#ecfdf5",
              color: "#047857",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            Grandfathered until 31 Jul 2026
          </span>
        ) : null}
      </header>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
          gap: "0.75rem",
          margin: 0,
        }}
      >
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Status</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>{status}</dd>
        </div>
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Go-live</dt>
          <dd style={{ margin: 0 }}>
            {goLiveAt ? new Date(goLiveAt).toLocaleDateString() : "Not set"}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Trial ends</dt>
          <dd style={{ margin: 0 }}>
            {trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : "Not set"}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Period end</dt>
          <dd style={{ margin: 0 }}>
            {currentPeriodEndsAt
              ? new Date(currentPeriodEndsAt).toLocaleDateString()
              : "Not set"}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Plan</dt>
          <dd style={{ margin: 0 }}>KaiMentors Standard — R400/month</dd>
        </div>
      </dl>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          disabled={loading !== null}
          onClick={() => runAction("mark_paid")}
          type="button"
        >
          {loading === "mark_paid" ? "Saving…" : "Mark paid (+30 days)"}
        </button>
        <button
          disabled={loading !== null}
          onClick={() => runAction("set_go_live")}
          type="button"
        >
          {loading === "set_go_live" ? "Saving…" : "Set go-live now"}
        </button>
        <button
          disabled={loading !== null}
          onClick={() => runAction("suspend")}
          type="button"
        >
          {loading === "suspend" ? "Saving…" : "Suspend"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label htmlFor={`extend-${traderId}`}>Extend trial (days)</label>
        <input
          id={`extend-${traderId}`}
          min={1}
          onChange={(event) => setExtendDays(event.target.value)}
          style={{ width: "5rem" }}
          type="number"
          value={extendDays}
        />
        <button
          disabled={loading !== null}
          onClick={() =>
            runAction("extend_trial", { days: Number.parseInt(extendDays, 10) || 30 })
          }
          type="button"
        >
          {loading === "extend_trial" ? "Saving…" : "Extend trial"}
        </button>
      </div>

      {message ? <p style={{ margin: 0, fontSize: "0.88rem" }}>{message}</p> : null}
    </div>
  );
}
