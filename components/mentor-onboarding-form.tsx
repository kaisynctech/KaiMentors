"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MailCheck, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth-form.module.css";

export function MentorOnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "code" | "verified">("details");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const portalPrefix = (() => {
    const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configuredUrl) return "your-domain.com/portal/";
    try {
      return `${new URL(configuredUrl).host}/portal/`;
    } catch {
      return "your-domain.com/portal/";
    }
  })();

  function emailError(error: unknown) {
    const fallback =
      "We could not send your verification code. Check the SMTP settings and try again.";
    if (!(error instanceof Error)) return fallback;
    if (error.message.toLowerCase().includes("confirmation email")) {
      return fallback;
    }
    return error.message;
  }

  async function sendCode(nextEmail: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: nextEmail,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async function submitDetails(formData: FormData) {
    setLoading(true);
    setMessage("");

    try {
      const nextPassword = String(formData.get("password"));
      const passwordConfirmation = String(formData.get("passwordConfirmation"));
      if (nextPassword !== passwordConfirmation) {
        setMessage("The passwords do not match.");
        return;
      }
      setPassword(nextPassword);

      const response = await fetch("/api/trader/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Your workspace could not be created.");
        return;
      }

      const nextEmail = String(payload.email ?? formData.get("email")).trim();
      setEmail(nextEmail);
      setStep("code");

      try {
        await sendCode(nextEmail);
      } catch (error) {
        setMessage(emailError(error));
      }
    } catch {
      setMessage("Your workspace could not be created. Please try again.");
    } finally {
      setLoading(false);
    }
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (profile?.role !== "trader") {
        throw new Error("This account is not connected to a mentor workspace.");
      }

      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });
      if (passwordError) {
        throw new Error("Your email was verified, but the password could not be saved.");
      }

      setPassword("");
      setStep("verified");
    } catch (error) {
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
    } catch (error) {
      setMessage(emailError(error));
    } finally {
      setLoading(false);
    }
  }

  if (step === "verified") {
    return (
      <div className={styles.success}>
        <CheckCircle2 size={38} />
        <h2>Your email is verified</h2>
        <p>Your mentor workspace is ready. Continue to finish setting it up.</p>
        <button onClick={() => router.push("/dashboard")} type="button">
          Continue to workspace
        </button>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form action={verifyCode} className={styles.form}>
        <div className={styles.codeIntro}>
          <MailCheck size={22} />
          <div>
            <strong>Verify your email</strong>
            <span>We sent a six-digit verification code to {email}.</span>
          </div>
        </div>
        <label>
          Verification code
          <input
            autoComplete="one-time-code"
            className={styles.codeInput}
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="code"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
          />
        </label>
        {message && <p className={styles.error}>{message}</p>}
        <button disabled={loading} type="submit">
          {loading && <Loader2 className={styles.spin} size={18} />}
          Verify mentor account
        </button>
        <button
          className={styles.backButton}
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
    <form action={submitDetails} className={styles.form}>
      <div className={styles.twoColumns}>
        <label>
          Full name
          <input name="fullName" autoComplete="name" required />
        </label>
        <label>
          Academy name
          <input name="displayName" required />
        </label>
      </div>
      <label>
        Legal or business name
        <input name="legalName" required />
      </label>
      <label>
        Portal address
        <span className={styles.slugField}>
          <small>{portalPrefix}</small>
          <input
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="your-academy"
            required
          />
        </span>
      </label>
      <label>
        Email address
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <div className={styles.twoColumns}>
        <label>
          Create password
          <input
            autoComplete="new-password"
            minLength={10}
            name="password"
            required
            type="password"
          />
          <small>Use at least 10 characters.</small>
        </label>
        <label>
          Confirm password
          <input
            autoComplete="new-password"
            minLength={10}
            name="passwordConfirmation"
            required
            type="password"
          />
        </label>
      </div>
      {message && <p className={styles.error}>{message}</p>}
      <button disabled={loading} type="submit">
        {loading && <Loader2 className={styles.spin} size={18} />}
        Create mentor workspace
      </button>
    </form>
  );
}
