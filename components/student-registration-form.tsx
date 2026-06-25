"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./student-registration-form.module.css";

interface RegistrationFormProps {
  portalSlug: string;
  primaryColor: string;
  loginPath?: string;
}

const STEPS = ["Profile", "Experience", "Review"] as const;
type StepIndex = 0 | 1 | 2;

const LEVELS = [
  { value: "beginner", label: "Beginner", desc: "Just starting out — learning the basics" },
  { value: "intermediate", label: "Intermediate", desc: "Consistent practice, refining a strategy" },
  { value: "advanced", label: "Advanced", desc: "Profitable, working on psychology & scale" },
  { value: "funded", label: "Funded Trader", desc: "Trading a prop or funded account" },
] as const;

export function StudentRegistrationForm({ portalSlug, primaryColor, loginPath }: RegistrationFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [existingUser, setExistingUser] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step 1 — Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Step 2 — Experience
  const [tradingLevel, setTradingLevel] = useState("");
  const [yearsTrading, setYearsTrading] = useState("");
  const [tradingChallenge, setTradingChallenge] = useState("");

  // Step 3 — Review
  const [consentChecked, setConsentChecked] = useState(false);

  const step1Valid = fullName.trim().length >= 2 && email.includes("@") && phoneNumber.trim().length >= 7;
  const step2Valid = tradingLevel !== "";
  const canNext = step === 0 ? step1Valid : step2Valid;

  async function submit(formData: FormData) {
    setLoading(true);
    setSubmitError("");
    formData.set("portalSlug", portalSlug);
    try {
      const response = await fetch("/api/student/register", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Registration could not be completed.");
      const resolvedEmail = String(payload.email ?? formData.get("email")).trim().toLowerCase();
      if (payload.existingUser) {
        setExistingUser(true);
        setDone(true);
      } else {
        window.sessionStorage.setItem("kaimentors.accountSetupEmail", resolvedEmail);
        setDone(true);
        setTimeout(() => router.push("/account-setup"), 1500);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Registration could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    if (existingUser) {
      return (
        <div className={styles.success}>
          <CheckCircle2 size={42} style={{ color: primaryColor }} />
          <h2>Welcome back!</h2>
          <p>Your application has been received. Sign in to access your academy dashboard.</p>
          {loginPath ? (
            <a className={styles.loginLink} href={loginPath} style={{ color: primaryColor }}>
              Sign in →
            </a>
          ) : null}
        </div>
      );
    }
    return (
      <div className={styles.success}>
        <CheckCircle2 size={42} style={{ color: primaryColor }} />
        <h2>Application submitted!</h2>
        <p>Check your inbox to verify your email and create your password.</p>
      </div>
    );
  }

  return (
    <form action={submit} className={styles.form}>
      {/* Hidden inputs carry all state values into FormData at submission */}
      <input type="hidden" name="fullName" value={fullName} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="phoneNumber" value={phoneNumber} />
      <input type="hidden" name="tradingLevel" value={tradingLevel} />
      <input type="hidden" name="yearsTrading" value={yearsTrading} />
      <input type="hidden" name="tradingChallenge" value={tradingChallenge} />

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
          <p className={styles.stepNote}>Your password will be created only after your email address is verified.</p>
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
            <p>Once your email is verified and your account is created, you&apos;ll be taken to your student dashboard. From there, you can submit your broker account details to complete verification and unlock full academy access.</p>
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
