"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  initialAccountNumber?: string;
  autoSubmit?: boolean;
}

function isXmBroker(brokers: VerifyBroker[]) {
  return brokers.some((broker) => isXmBrokerName(broker.broker_name));
}

export function VerifyAccountForm({
  portalId,
  brokers,
  studentHome,
  initialAccountNumber = "",
  autoSubmit = false,
}: VerifyAccountFormProps) {
  const [brokerConnectionId, setBrokerConnectionId] = useState(
    brokers.length === 1 ? brokers[0].id : "",
  );
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [loading, setLoading] = useState(
    autoSubmit && initialAccountNumber.trim().length >= 3,
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const autoSubmitted = useRef(false);
  const isXm = isXmBroker(brokers);

  async function submitVerification(nextAccount: string) {
    setLoading(true);
    setError("");
    setSuccessMessage("");

    const trimmedAccount = nextAccount.trim();
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

  useEffect(() => {
    if (!autoSubmit || autoSubmitted.current) return;
    const trimmed = initialAccountNumber.trim();
    if (trimmed.length < 3) return;
    autoSubmitted.current = true;
    void submitVerification(trimmed);
    // Auto-verify once when the student already submitted an XM ID at join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, initialAccountNumber]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitVerification(accountNumber);
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
      <h3 className={styles.formTitle}>
        {loading && autoSubmit && !error
          ? isXm
            ? "Checking your XM ID…"
            : "Checking your trading account…"
          : "Verify your broker account"}
      </h3>

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
