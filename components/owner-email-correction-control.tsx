"use client";

import { useState } from "react";

export function OwnerEmailCorrectionControl({ traderId }: { traderId: string }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function correct() {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/admin/traders/owner-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ traderId, newEmail: email, reason }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Email correction failed.");
      setMessage("Correction recorded. The owner must verify through Resume Account Setup.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Email correction failed."); }
    finally { setLoading(false); }
  }
  return <details><summary>Correct owner email</summary><input aria-label="Corrected owner email" onChange={(event) => setEmail(event.target.value)} placeholder="Correct email" type="email" value={email} /><input aria-label="Correction reason" minLength={10} onChange={(event) => setReason(event.target.value)} placeholder="Reason for correction" value={reason} /><button disabled={loading || !email || reason.trim().length < 10} onClick={correct} type="button">{loading ? "Saving..." : "Start correction"}</button>{message ? <span>{message}</span> : null}</details>;
}
