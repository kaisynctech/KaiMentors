"use client";

import { useState } from "react";
import styles from "./referral-account.module.css";

export function ReferralJoinPanel({ portalSlug }: { portalSlug: string }) {
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/referrals/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portalSlug, fullName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create a code.");
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create a code.");
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="referral-name">
        Your name
        <input
          id="referral-name"
          minLength={2}
          onChange={(event) => setFullName(event.target.value)}
          required
          value={fullName}
        />
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <button className="button button-primary" disabled={loading} type="submit">
        {loading ? "Creating…" : "Create my referral code"}
      </button>
    </form>
  );
}

export function ReferralCodeCard({
  code,
  shareUrl,
}: {
  code: string;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copy() {
    const absolute = new URL(shareUrl, window.location.origin).toString();
    setCopyError("");
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      return;
    } catch {
      // Clipboard can be blocked. Fall back to a selected field the person can copy.
    }
    try {
      const field = document.createElement("textarea");
      field.value = absolute;
      document.body.append(field);
      field.select();
      const didCopy = document.execCommand("copy");
      field.remove();
      if (didCopy) {
        setCopied(true);
        return;
      }
    } catch {
      // The link stays visible above the button.
    }
    setCopied(false);
    setCopyError("Select the link above and copy it.");
  }

  return (
    <section className={`card ${styles.card}`}>
      <p className="eyebrow">Your code</p>
      <p className={styles.code}>{code}</p>
      <p className={styles.link}>{shareUrl}</p>
      <button className="button button-secondary" onClick={copy} type="button">
        {copied ? "Copied" : "Copy enrolment link"}
      </button>
      {copyError ? <p className={styles.error}>{copyError}</p> : null}
    </section>
  );
}
