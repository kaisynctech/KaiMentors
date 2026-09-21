"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { VerificationMethod } from "@/lib/database.types";
import {
  affiliateMismatchMessage,
  isXmBrokerName,
  requiredAccountNumberMessage,
} from "@/lib/broker-verify-copy";
import styles from "./verify-account-form.module.css";

interface VerifyBroker {
  id: string;
  broker_name: string;
  verification_method: VerificationMethod;
}

interface VerifyAccountFormProps {
  portalId: string;
  brokers: VerifyBroker[];
  studentHome: string;
}

function isXmBroker(brokers: VerifyBroker[]) {
  return brokers.some((broker) => isXmBrokerName(broker.broker_name));
}

export function VerifyAccountForm({ portalId, brokers, studentHome }: VerifyAccountFormProps) {
  const [brokerConnectionId, setBrokerConnectionId] = useState(
    brokers.length === 1 ? brokers[0].id : "",
  );
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const isXm = isXmBroker(brokers);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    const trimmedAccount = accountNumber.trim();
    if (trimmedAccount.length < 3) {
      setError(requiredAccountNumberMessage(isXm));
      setLoading(false);
      return;
    }

    try {
      const body: Record<string, string> = {
        portalId,
        accountNumber: trimmedAccount,
      };
      if (brokerConnectionId) body.brokerConnectionId = brokerConnectionId;

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
        window.location.href = studentHome;
        return;
      }

      if (payload.status === "mismatch") {
        setError(
          payload.error ?? affiliateMismatchMessage(isXm),
        );
        return;
      }

      if (payload.status === "manual_review") {
        if (isXm) {
          setError(
            "We could not check this XM ID just now. Please try again in a moment.",
          );
          return;
        }
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
        <label htmlFor="vaf_account">
          {isXm ? "XM client ID number" : "Trading account number"}
        </label>
        <input
          autoComplete="off"
          id="vaf_account"
          inputMode="numeric"
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder={isXm ? "Your XM client ID" : "Your trading account number"}
          required
          type="text"
          value={accountNumber}
        />
        <small>
          {isXm
            ? "This is the number from your XM MT4/MT5 login. You must enter it — you cannot leave it blank."
            : "Enter the account number your broker gave you. You cannot leave this blank."}
        </small>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.submitBtn} disabled={loading} type="submit">
        {loading ? <Loader2 className={styles.spin} size={16} /> : null}
        {loading ? "Verifying…" : "Verify my account"}
      </button>
    </form>
  );
}
