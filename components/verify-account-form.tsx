"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { VerificationMethod } from "@/lib/database.types";
import styles from "./verify-account-form.module.css";

interface VerifyBroker {
  id: string;
  broker_name: string;
  verification_method: VerificationMethod;
}

interface VerifyAccountFormProps {
  portalId: string;
  brokers: VerifyBroker[];
  querySuffix: string;
}

export function VerifyAccountForm({ portalId, brokers, querySuffix }: VerifyAccountFormProps) {
  const [brokerConnectionId, setBrokerConnectionId] = useState(
    brokers.length === 1 ? brokers[0].id : "",
  );
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const body: Record<string, string> = { portalId };
      if (brokerConnectionId) body.brokerConnectionId = brokerConnectionId;
      if (accountNumber.trim()) body.accountNumber = accountNumber.trim();

      const response = await fetch("/api/student/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Verification could not be completed. Please try again.");
        return;
      }

      if (payload.status === "verified") {
        window.location.href = `/student${querySuffix}`;
        return;
      }

      if (payload.status === "manual_review") {
        setSuccessMessage(
          "We couldn't verify automatically — your account has been sent for manual review. You'll receive an email when it's approved.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (successMessage) {
    return (
      <div className={styles.successMessage}>
        <p>{successMessage}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Verify your broker account</h3>

      {brokers.length > 1 && (
        <div className={styles.field}>
          <label htmlFor="vaf_broker">Which broker is your account with?</label>
          <select
            id="vaf_broker"
            onChange={(e) => setBrokerConnectionId(e.target.value)}
            value={brokerConnectionId}
          >
            <option value="">I&apos;m not sure</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.broker_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="vaf_account">Trading account number</label>
        <input
          autoComplete="off"
          id="vaf_account"
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="Leave blank if unknown"
          type="text"
          value={accountNumber}
        />
        <small>Don&apos;t know it? Leave blank and upload a screenshot below.</small>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.submitBtn} disabled={loading} type="submit">
        {loading ? <Loader2 className={styles.spin} size={16} /> : null}
        {loading ? "Verifying…" : "Verify my account"}
      </button>
    </form>
  );
}
