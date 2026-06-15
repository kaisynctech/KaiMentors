"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MailCheck,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import type { VerificationMethod } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/browser";
import styles from "./student-registration-form.module.css";

interface RegistrationBroker {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  connectionId: string;
  affiliateLink: string | null;
  verificationMethod: VerificationMethod;
}

interface RegistrationFormProps {
  portalId: string;
  portalSlug: string;
  traderId: string;
  brokers: RegistrationBroker[];
  primaryColor: string;
  studentPortalPath?: string;
}

export function StudentRegistrationForm({
  portalId,
  portalSlug,
  traderId,
  brokers,
  primaryColor,
  studentPortalPath = "/student",
}: RegistrationFormProps) {
  const [state, setState] = useState<"idle" | "code" | "success" | "error">(
    "idle",
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const selectedBroker = useMemo(
    () => brokers.find((broker) => broker.connectionId === selectedBrokerId),
    [brokers, selectedBrokerId],
  );

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");

    const nextPassword = String(formData.get("password"));
    if (nextPassword !== String(formData.get("passwordConfirmation"))) {
      setState("error");
      setMessage("The passwords do not match.");
      setLoading(false);
      return;
    }

    formData.set("portalId", portalId);
    formData.set("portalSlug", portalSlug);
    formData.set("traderId", traderId);
    const response = await fetch("/api/student/register", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Registration could not be completed.");
      setLoading(false);
      return;
    }

    const nextEmail = String(payload.email ?? formData.get("email")).trim();
    setEmail(nextEmail);
    setPassword(nextPassword);

    try {
      await sendCode(nextEmail);
      setState("code");
    } catch {
      setState("code");
      setMessage(
        "Your application was saved, but the verification email could not be sent. Try resending the code.",
      );
    }
    setLoading(false);
  }

  async function sendCode(nextEmail: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: nextEmail,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async function verifyCode(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: String(formData.get("code")).trim(),
        type: "email",
      });
      if (error || !data.user) {
        throw error ?? new Error("The verification code is invalid.");
      }
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });
      if (passwordError) {
        throw new Error("Your email was verified, but the password could not be saved.");
      }
      setPassword("");
      setState("success");
      setMessage(
        "Your email is verified and your application was submitted. Sign in with your email and password to follow its status.",
      );
    } catch (error) {
      setState("code");
      setMessage(
        error instanceof Error
          ? error.message
          : "The verification code could not be verified.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setLoading(true);
    setMessage("");
    try {
      await sendCode(email);
      setState("code");
    } catch {
      setState("code");
      setMessage("The verification code could not be resent.");
    } finally {
      setLoading(false);
    }
  }

  if (state === "success") {
    return (
      <div className={styles.success}>
        <CheckCircle2 size={34} style={{ color: primaryColor }} />
        <h2>Application received</h2>
        <p>{message}</p>
        <Link
          className={styles.continueButton}
          href={studentPortalPath}
          style={{ background: primaryColor }}
        >
          Continue to student portal
        </Link>
      </div>
    );
  }

  if (state === "code") {
    return (
      <form action={verifyCode} className={styles.form}>
        <div className={styles.codeIntro}>
          <MailCheck size={22} />
          <div>
            <strong>Verify your email</strong>
            <span>We sent a six-digit verification code to {email}.</span>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="studentVerificationCode">Verification code</label>
          <input
            autoComplete="one-time-code"
            className={styles.codeInput}
            id="studentVerificationCode"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="code"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
          />
        </div>
        {message && <p className={styles.error}>{message}</p>}
        <button
          className={styles.submit}
          disabled={loading}
          style={{ background: primaryColor }}
          type="submit"
        >
          {loading ? <Loader2 className={styles.spin} size={18} /> : null}
          Verify student account
        </button>
        <button
          className={styles.resend}
          disabled={loading}
          onClick={resendCode}
          type="button"
        >
          <RotateCcw size={15} /> Resend verification code
        </button>
      </form>
    );
  }

  return (
    <form action={submit} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" autoComplete="name" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="phoneNumber">Phone number</label>
        <input
          id="phoneNumber"
          name="phoneNumber"
          placeholder="+27 82 000 0000"
          required
          type="tel"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="studentPassword">Create password</label>
        <input
          autoComplete="new-password"
          id="studentPassword"
          minLength={10}
          name="password"
          required
          type="password"
        />
        <small>Use at least 10 characters.</small>
      </div>
      <div className={styles.field}>
        <label htmlFor="studentPasswordConfirmation">Confirm password</label>
        <input
          autoComplete="new-password"
          id="studentPasswordConfirmation"
          minLength={10}
          name="passwordConfirmation"
          required
          type="password"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="brokerConnectionId">Broker</label>
        <select
          id="brokerConnectionId"
          name="brokerConnectionId"
          onChange={(event) => setSelectedBrokerId(event.target.value)}
          required
          value={selectedBrokerId}
        >
          <option value="">Select your broker</option>
          {brokers.map((broker) => (
            <option key={broker.connectionId} value={broker.connectionId}>
              {broker.name}
            </option>
          ))}
        </select>
        {selectedBroker ? (
          <small>
            Verification:{" "}
            {selectedBroker.verificationMethod.replace(/_/g, " ")}
          </small>
        ) : null}
      </div>
      <div className={styles.field}>
        <label htmlFor="tradingAccountNumber">Trading account number</label>
        <input
          id="tradingAccountNumber"
          name="tradingAccountNumber"
          autoComplete="off"
          required
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="platformAccountNumber">MT4/MT5 number</label>
        <input
          id="platformAccountNumber"
          name="platformAccountNumber"
          autoComplete="off"
          required
        />
        <small>Enter the login number shown in MT4 or MT5.</small>
      </div>
      <label className={styles.upload}>
        <UploadCloud size={20} />
        <span>
          <strong>Screenshot proof</strong>
          <small>Optional PNG, JPG, or WebP up to 10 MB.</small>
        </span>
        <input
          accept="image/png,image/jpeg,image/webp"
          name="screenshotProof"
          type="file"
        />
      </label>
      {selectedBroker?.affiliateLink ? (
        <a
          className={styles.affiliate}
          href={selectedBroker.affiliateLink}
          rel="noreferrer"
          target="_blank"
        >
          Open an account with {selectedBroker.name}
          <ExternalLink size={15} />
        </a>
      ) : null}
      <label className={styles.consent}>
        <input name="consent" type="checkbox" required />
        <span>
          I consent to my account details being checked with the selected broker
          for affiliate verification.
        </span>
      </label>
      {state === "error" && <p className={styles.error}>{message}</p>}
      <button
        className={styles.submit}
        disabled={loading || brokers.length === 0}
        style={{ background: primaryColor }}
        type="submit"
      >
        {loading ? <Loader2 className={styles.spin} size={18} /> : null}
        Submit for verification
      </button>
      {brokers.length === 0 && (
        <p className={styles.error}>This mentor has not enabled registration yet.</p>
      )}
    </form>
  );
}
