"use client";

import { ChevronLeft, ChevronRight, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./student-registration-form.module.css";

interface RegistrationFormProps {
  portalSlug: string;
  primaryColor: string;
  loginPath?: string;
  academyName?: string;
  studentDestination?: string;
}

const STEPS = ["Profile", "Experience", "Review"] as const;
type StepIndex = 0 | 1 | 2;

const LEVELS = [
  { value: "beginner", label: "Beginner", desc: "Just starting out — learning the basics" },
  { value: "intermediate", label: "Intermediate", desc: "Consistent practice, refining a strategy" },
  { value: "advanced", label: "Advanced", desc: "Profitable, working on psychology & scale" },
  { value: "funded", label: "Funded Trader", desc: "Trading a prop or funded account" },
] as const;

export function StudentRegistrationForm({
  portalSlug,
  primaryColor,
  loginPath,
  academyName,
  studentDestination = "/student",
}: RegistrationFormProps) {
  const [step, setStep] = useState<StepIndex>(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [existingUser, setExistingUser] = useState(false);
  const [otpState, setOtpState] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step 1 — Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  // Step 2 — Experience
  const [tradingLevel, setTradingLevel] = useState("");
  const [yearsTrading, setYearsTrading] = useState("");
  const [tradingChallenge, setTradingChallenge] = useState("");

  // Step 3 — Review
  const [consentChecked, setConsentChecked] = useState(false);

  const step1Valid =
    fullName.trim().length >= 2 &&
    email.includes("@") &&
    phoneNumber.trim().length >= 7 &&
    password.length >= 10 &&
    password === passwordConfirmation;
  const step2Valid = tradingLevel !== "";
  const canNext = step === 0 ? step1Valid : step2Valid;

  async function submit(formData: FormData) {
    setLoading(true);
    setSubmitError("");
    formData.set("portalSlug", portalSlug);
    formData.set("password", password);
    try {
      const response = await fetch("/api/student/register", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Registration could not be completed.");
      if (payload.existingUser) {
        setExistingUser(true);
        setDone(true);
      } else {
        setOtpState(true);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Registration could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setOtpLoading(true);
    setOtpError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode.trim(),
        type: "email",
      });
      if (error) throw new Error("The code is incorrect or has expired.");
      window.location.href = studentDestination;
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setOtpLoading(false);
    }
  }

  async function resendOtp() {
    await fetch("/api/student/resend-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  if (done && existingUser) {
    return (
      <div className={styles.success}>
        <ShieldCheck size={42} style={{ color: primaryColor }} />
        <h2>Application submitted!</h2>
        <p>You already have a KaiMentors account. Sign in with your existing password to access your dashboard.</p>
        {loginPath ? (
          <a className={styles.loginLink} href={loginPath} style={{ color: primaryColor }}>
            Sign in to {academyName ?? "your academy"} →
          </a>
        ) : null}
      </div>
    );
  }

  if (otpState) {
    return (
      <div className={styles.otpScreen}>
        <MailCheck size={36} style={{ color: primaryColor }} />
        <h2>Check your inbox</h2>
        <p>We sent a 6-digit code to <strong>{email}</strong>. Enter it below to activate your account.</p>
        <input
          autoComplete="one-time-code"
          className={styles.codeInput}
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          onChange={(e) => setOtpCode(e.target.value)}
          pattern="[0-9]{6}"
          placeholder="000000"
          value={otpCode}
        />
        {otpError && <p className={styles.error}>{otpError}</p>}
        <button
          disabled={otpCode.length !== 6 || otpLoading}
          onClick={verifyOtp}
          style={{ background: primaryColor }}
          type="button"
        >
          {otpLoading ? <Loader2 className={styles.spin} size={18} /> : null}
          Verify and continue
        </button>
        <button className={styles.backButton} onClick={resendOtp} type="button">
          Resend code
        </button>
      </div>
    );
  }

  return (
    <form action={submit} className={styles.form}>
      {/* Hidden inputs carry state values into FormData at submission */}
      <input type="hidden" name="fullName" value={fullName} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="phoneNumber" value={phoneNumber} />
      <input type="hidden" name="tradingLevel" value={tradingLevel} />
      <input type="hidden" name="yearsTrading" value={yearsTrading} />
      <input type="hidden" name="tradingChallenge" value={tradingChallenge} />
      {/* password is injected via formData.set() in submit(), never a hidden input */}

      {/* Step indicator */}
      <div className={styles.steps}>
        {STEPS.map((label, i) => (
          <div
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`${styles.stepDot}${i < step ? ` ${styles.stepDone}` : ""}`}
          >
            <span
              className={styles.dotCircle}
              style={i <= step ? { background: primaryColor, borderColor: primaryColor } : undefined}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className={styles.dotLabel} style={i === step ? { color: "#22272b", fontWeight: 750 } : undefined}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1 — Profile */}
      {step === 0 && (
        <>
          <div className={styles.field}>
            <label htmlFor="srf_fullName">Full name</label>
            <input autoComplete="name" id="srf_fullName" onChange={(e) => setFullName(e.target.value)} required value={fullName} />
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_email">Email address</label>
            <input autoComplete="email" id="srf_email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_phone">Phone number</label>
            <input id="srf_phone" onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+27 82 000 0000" required type="tel" value={phoneNumber} />
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_password">Create a password</label>
            <input
              autoComplete="new-password"
              id="srf_password"
              minLength={10}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_passwordConfirm">Confirm password</label>
            <input
              autoComplete="new-password"
              id="srf_passwordConfirm"
              minLength={10}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              required
              type="password"
              value={passwordConfirmation}
            />
          </div>
          {password.length > 0 && password.length < 10 && (
            <p className={styles.fieldHint}>Password must be at least 10 characters.</p>
          )}
          {password.length >= 10 && passwordConfirmation.length > 0 && password !== passwordConfirmation && (
            <p className={styles.fieldHint}>Passwords do not match.</p>
          )}
          <p className={styles.stepNote}>You&apos;ll use this password to sign in after verifying your email.</p>
        </>
      )}

      {/* Step 2 — Experience */}
      {step === 1 && (
        <>
          <p className={styles.levelPrompt}>Where are you right now?</p>
          <div className={styles.levelGrid}>
            {LEVELS.map(({ value, label, desc }) => (
              <label
                key={value}
                className={`${styles.levelCard}${tradingLevel === value ? ` ${styles.levelSelected}` : ""}`}
                style={tradingLevel === value ? { borderColor: primaryColor } : undefined}
              >
                <input
                  checked={tradingLevel === value}
                  name="tradingLevelRadio"
                  onChange={() => setTradingLevel(value)}
                  type="radio"
                  value={value}
                />
                <strong>{label}</strong>
                <span>{desc}</span>
              </label>
            ))}
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_years">How long have you been trading?</label>
            <select id="srf_years" onChange={(e) => setYearsTrading(e.target.value)} value={yearsTrading}>
              <option value="">Select…</option>
              <option value="less_than_1">Less than 1 year</option>
              <option value="1_to_3">1–3 years</option>
              <option value="3_to_5">3–5 years</option>
              <option value="5_plus">5+ years</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_challenge">Biggest challenge right now</label>
            <textarea
              id="srf_challenge"
              maxLength={500}
              onChange={(e) => setTradingChallenge(e.target.value)}
              placeholder="Risk management, entries, psychology, consistency…"
              rows={3}
              value={tradingChallenge}
            />
          </div>
        </>
      )}

      {/* Step 3 — Review */}
      {step === 2 && (
        <>
          <div className={styles.reviewBox}>
            <strong>What happens next</strong>
            <p>After submitting, you&apos;ll receive a 6-digit code by email. Enter it on the next screen to activate your account and sign in to your student dashboard.</p>
          </div>
          <div className={styles.disclaimerCard}>
            <strong>⚠ Important — please read before submitting</strong>
            <p>Trading financial instruments involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. All content provided through this academy is strictly educational and does not constitute financial advice. You are solely responsible for any trading decisions you make.</p>
          </div>
          <label className={styles.consent}>
            <input
              checked={consentChecked}
              name="consent"
              onChange={(e) => setConsentChecked(e.target.checked)}
              required
              type="checkbox"
            />
            <span>I have read and understood the above. I consent to my trading account being verified against the academy&apos;s connected broker(s) when I submit my verification details from the student portal. I accept full responsibility for my own trading decisions.</span>
          </label>
          {submitError && <p className={styles.error}>{submitError}</p>}
        </>
      )}

      {/* Navigation */}
      <div className={styles.navRow}>
        {step > 0 && (
          <button className={styles.backBtn} onClick={() => setStep((s) => (s - 1) as StepIndex)} type="button">
            <ChevronLeft size={16} />Back
          </button>
        )}
        {step < 2 ? (
          <button
            className={styles.nextBtn}
            disabled={!canNext}
            onClick={() => setStep((s) => (s + 1) as StepIndex)}
            style={canNext ? { background: primaryColor } : undefined}
            type="button"
          >
            Next<ChevronRight size={16} />
          </button>
        ) : (
          <button className={styles.submit} disabled={loading || !consentChecked} style={{ background: primaryColor }} type="submit">
            {loading ? <Loader2 className={styles.spin} size={18} /> : null}
            Join Academy
          </button>
        )}
      </div>
    </form>
  );
}
