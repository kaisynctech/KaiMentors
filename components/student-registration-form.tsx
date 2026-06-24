"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { VerificationMethod } from "@/lib/database.types";
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
  portalSlug: string;
  brokers: RegistrationBroker[];
  primaryColor: string;
  studentPortalPath?: string;
}

const STEPS = ["Profile", "Experience", "Broker", "Review"] as const;
type StepIndex = 0 | 1 | 2 | 3;

const LEVELS = [
  { value: "beginner", label: "Beginner", desc: "Just starting out — learning the basics" },
  { value: "intermediate", label: "Intermediate", desc: "Consistent practice, refining a strategy" },
  { value: "advanced", label: "Advanced", desc: "Profitable, working on psychology & scale" },
  { value: "funded", label: "Funded Trader", desc: "Trading a prop or funded account" },
] as const;

export function StudentRegistrationForm({ portalSlug, brokers, primaryColor }: RegistrationFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step 1 — Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Step 2 — Experience
  const [tradingLevel, setTradingLevel] = useState("");
  const [yearsTrading, setYearsTrading] = useState("");
  const [tradingChallenge, setTradingChallenge] = useState("");

  // Step 3 — Broker
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const [hasAccount, setHasAccount] = useState<"yes" | "no">("yes");
  const [tradingAccountNumber, setTradingAccountNumber] = useState("");
  const [platformAccountNumber, setPlatformAccountNumber] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Step 4 — Review
  const [consentChecked, setConsentChecked] = useState(false);

  const selectedBroker = useMemo(
    () => brokers.find((b) => b.connectionId === selectedBrokerId),
    [brokers, selectedBrokerId],
  );

  const step1Valid = fullName.trim().length >= 2 && email.includes("@") && phoneNumber.trim().length >= 7;
  const step2Valid = tradingLevel !== "";
  const step3Valid = selectedBrokerId !== "" && hasAccount === "yes" &&
    tradingAccountNumber.trim().length >= 3 && platformAccountNumber.trim().length >= 3;
  const canNext = step === 0 ? step1Valid : step === 1 ? step2Valid : step3Valid;

  async function submit(formData: FormData) {
    setLoading(true);
    setSubmitError("");
    if (screenshotFile) formData.set("screenshotProof", screenshotFile);
    formData.set("portalSlug", portalSlug);
    try {
      const response = await fetch("/api/student/register", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Registration could not be completed.");
      const resolvedEmail = String(payload.email ?? formData.get("email")).trim().toLowerCase();
      window.sessionStorage.setItem("kaimentors.accountSetupEmail", resolvedEmail);
      setDone(true);
      setTimeout(() => router.push("/account-setup"), 1500);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Registration could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
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
      <input type="hidden" name="brokerConnectionId" value={selectedBrokerId} />
      <input type="hidden" name="tradingAccountNumber" value={tradingAccountNumber} />
      <input type="hidden" name="platformAccountNumber" value={platformAccountNumber} />

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

      {/* Step 3 — Broker */}
      {step === 2 && (
        <>
          {brokers.length === 0 ? (
            <p className={styles.error}>This academy has not enabled registration yet.</p>
          ) : (
            <>
              <div className={styles.field}>
                <label htmlFor="srf_broker">Broker</label>
                <select id="srf_broker" onChange={(e) => setSelectedBrokerId(e.target.value)} required value={selectedBrokerId}>
                  <option value="">Select your broker</option>
                  {brokers.map((b) => <option key={b.connectionId} value={b.connectionId}>{b.name}</option>)}
                </select>
              </div>
              {selectedBroker && (
                <>
                  <div className={styles.field}>
                    <label htmlFor="srf_hasAccount">Do you have a {selectedBroker.name} account?</label>
                    <select id="srf_hasAccount" onChange={(e) => setHasAccount(e.target.value as "yes" | "no")} value={hasAccount}>
                      <option value="yes">Yes, I have an account</option>
                      <option value="no">No, not yet</option>
                    </select>
                  </div>
                  {hasAccount === "no" && (
                    <div className={styles.brokerGuide}>
                      {selectedBroker.affiliateLink && (
                        <a className={styles.affiliate} href={selectedBroker.affiliateLink} rel="noreferrer" target="_blank">
                          Open an account with {selectedBroker.name}<ExternalLink size={15} />
                        </a>
                      )}
                      <ol>
                        <li>Click the link above to visit {selectedBroker.name} using the academy&apos;s referral link.</li>
                        <li>Complete registration and upload your ID and proof of address.</li>
                        <li>Wait for account approval (1–2 business days).</li>
                        <li>Fund your account, then return here to complete your application.</li>
                      </ol>
                      <p className={styles.brokerGuideNote}>You&apos;ll need a verified broker account to complete your application. Come back once your account is ready.</p>
                    </div>
                  )}
                  {hasAccount === "yes" && (
                    <>
                      <div className={styles.field}>
                        <label htmlFor="srf_tradingAcc">Trading account number</label>
                        <input autoComplete="off" id="srf_tradingAcc" onChange={(e) => setTradingAccountNumber(e.target.value)} required value={tradingAccountNumber} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="srf_platformAcc">MT4/MT5 number</label>
                        <input autoComplete="off" id="srf_platformAcc" onChange={(e) => setPlatformAccountNumber(e.target.value)} required value={platformAccountNumber} />
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
                          onChange={(e) => setScreenshotFile(e.target.files?.[0] ?? null)}
                          type="file"
                        />
                      </label>
                      {selectedBroker.affiliateLink && (
                        <a className={styles.affiliate} href={selectedBroker.affiliateLink} rel="noreferrer" target="_blank">
                          Open an account with {selectedBroker.name}<ExternalLink size={15} />
                        </a>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Step 4 — Review */}
      {step === 3 && (
        <>
          <div className={styles.reviewBox}>
            <strong>What happens next</strong>
            <p>The team will review your application, verify your broker account details, and activate your student portal access. You&apos;ll receive an email confirmation with your login link once approved.</p>
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
            <span>I have read and understood the above. I consent to my account details being checked with the selected broker for verification purposes. I accept full responsibility for my own trading decisions.</span>
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
        {step < 3 ? (
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
