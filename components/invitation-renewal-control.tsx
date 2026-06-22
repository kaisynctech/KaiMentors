"use client";

import { useState } from "react";

export function InvitationRenewalControl({ invitationId }: { invitationId: string }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function renew() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/academy-invitations/renew", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId, reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Invitation could not be renewed.");
      setMessage("Renewed and code sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be renewed.");
    } finally {
      setLoading(false);
    }
  }
  return <details><summary>Renew setup</summary><input aria-label="Renewal reason" minLength={10} onChange={(event) => setReason(event.target.value)} placeholder="Reason for renewal" value={reason} /><button disabled={loading || reason.trim().length < 10} onClick={renew} type="button">{loading ? "Renewing..." : "Renew invitation"}</button>{message ? <span>{message}</span> : null}</details>;
}
