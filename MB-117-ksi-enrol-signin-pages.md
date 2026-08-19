# MB-117 — KSI Enrol & Sign-In Pages

**Date:** 2026-08-19  
**Architect:** KaiMentors Enterprise Architect  
**Status:** Ready for implementation

---

## Objective

Adapt the student registration and login pages for KaiSync Institution (KSI). KSI is a **subscription** portal — it has no broker partner, no trading context, and its entry pages must reflect a dark-themed AI academy brand. All changes must be backwards-compatible: existing verification portals (KaiTrades, TC, Milkers) must be completely unaffected.

---

## Context

- KSI portal `access_model = 'subscription'` (set in MB-115 migration).
- The current enrol and login pages are trading-specific and hardcoded to a light background with XM Global branding.
- `lib/academy-entry.ts` does not currently expose `access_model` — it must be added so page components can branch on it.
- Three new fields (`province`, `country`, `notifications_opt_in`) are needed on `student_applications` for KSI students.

Files to be modified in this MB:

| File | Change summary |
|---|---|
| `supabase/migrations/20260819150000_ksi_entry_fields.sql` | New — add 3 columns |
| `lib/academy-entry.ts` | Expose `access_model` |
| `components/academy-entry.module.css` | Add `.pageDark` variant |
| `components/academy-join-page.tsx` | Conditional dark theme, copy, badge, pass prop |
| `components/academy-login-page.tsx` | Conditional dark theme, copy, badge |
| `components/student-registration-form.tsx` | Subscription variant: AI levels, new fields, copy |
| `app/api/student/register/route.ts` | Save `province`, `country`, `notifications_opt_in` |

---

## Step 1 — DB Migration

**File:** `supabase/migrations/20260819150000_ksi_entry_fields.sql`

```sql
-- MB-117: Add province, country, notifications_opt_in to student_applications
-- These columns are nullable for backwards compatibility with existing verification portals.

alter table public.student_applications
  add column if not exists province              text,
  add column if not exists country               text,
  add column if not exists notifications_opt_in  boolean not null default false;

comment on column public.student_applications.province             is 'Student province/state — collected for subscription portals';
comment on column public.student_applications.country              is 'Student country — collected for subscription portals';
comment on column public.student_applications.notifications_opt_in is 'Whether student opted into marketing/update emails at registration';
```

---

## Step 2 — `lib/academy-entry.ts`

### 2a. Add `access_model` to `AcademyEntryPortal` interface

Locate the interface starting at line 7. After the `is_published` field (line 17), add:

```ts
  access_model: 'verification' | 'subscription';
```

### 2b. Add `access_model` to `portalSelect`

The `portalSelect` constant starts at line 52. The string currently begins with `"id,trader_id,slug,portal_name..."`. Append `,access_model` anywhere in the comma-separated string — place it immediately after `is_published`:

```
...,is_published,access_model,website_delivery_mode,...
```

No other changes to this file.

---

## Step 3 — `components/academy-entry.module.css`

Append the following block at the **end of the file** (after the closing `@media` block at line 158):

```css
/* ─── Dark theme — subscription portals (e.g. KSI) ─────────────────── */

.pageDark {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--academy-accent) 22%, transparent), transparent 34rem),
    #06060E;
  color: #F0EEF8;
}

.pageDark .navActions a,
.pageDark .backLink {
  border-color: rgba(240, 238, 248, 0.18);
  color: #F0EEF8;
}

.pageDark .primaryNav {
  background: var(--academy-primary);
  border-color: var(--academy-primary);
  color: #fff;
}

.pageDark .eyebrow {
  color: color-mix(in srgb, var(--academy-accent) 80%, #fff);
}

.pageDark .cardHeader p {
  color: rgba(240, 238, 248, 0.60);
}

.pageDark .footerNote,
.pageDark .footerNote a {
  color: rgba(240, 238, 248, 0.45);
}
```

---

## Step 4 — `components/academy-join-page.tsx`

### Current file (lines 1–83) — full replacement

Replace the entire file with the following:

```tsx
import Image from "next/image";
import Link from "next/link";
import { StudentRegistrationForm } from "@/components/student-registration-form";
import type { AcademyEntryContext } from "@/lib/academy-entry";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "./academy-entry.module.css";

export function AcademyJoinPage({
  customDomain = false,
  data,
}: {
  customDomain?: boolean;
  data: AcademyEntryContext;
}) {
  const logo = getPortalBrandingUrl(data.portal.logo_path);
  const routeContext = { portalSlug: data.portal.slug, customDomain };
  const homeHref = getAcademyEntryHref(routeContext, "home");
  const loginHref = getAcademyEntryHref(routeContext, "login");
  const studentPortalPath = getAcademyEntryHref(routeContext, "academy");
  const isSubscription = data.portal.access_model === "subscription";
  const theme = {
    "--academy-primary": data.portal.primary_color,
    "--academy-accent": data.portal.accent_color,
  } as React.CSSProperties;

  return (
    <main
      className={`${styles.page}${isSubscription ? ` ${styles.pageDark}` : ""}`}
      style={theme}
    >
      <section className={styles.shell}>
        <nav className={styles.nav}>
          <Link className={styles.brand} href={homeHref}>
            <span>
              {logo ? (
                <Image
                  alt={`${data.portal.portal_name} logo`}
                  height={48}
                  src={logo}
                  unoptimized
                  width={48}
                />
              ) : (
                data.portal.portal_name.slice(0, 1)
              )}
            </span>
            <strong>{data.portal.portal_name}</strong>
          </Link>
          <div className={styles.navActions}>
            <Link href={homeHref}>← Home</Link>
            <Link className={styles.primaryNav} href={loginHref}>
              Sign In
            </Link>
          </div>
        </nav>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.eyebrow}>
              {isSubscription ? "Enrolment" : "Student application"}
            </p>
            <h2>{data.portal.portal_name}</h2>
            <p>
              {isSubscription
                ? "Create your account below. Returning students should use Sign In."
                : "Use the form below to request private academy access. Returning students should use Sign In."}
            </p>
          </div>
          <StudentRegistrationForm
            accessModel={data.portal.access_model}
            academyName={data.portal.portal_name}
            loginPath={loginHref}
            portalSlug={data.portal.slug}
            primaryColor={data.portal.primary_color}
            studentDestination={studentPortalPath}
          />
          {!isSubscription && (
            <div className={styles.partnerBadge}>
              <Image
                alt="XM Global"
                height={18}
                src="/images/xm-global-logo.svg"
                unoptimized
                width={60}
              />
              <span>Partnered with XM Global</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
```

---

## Step 5 — `components/academy-login-page.tsx`

### Current file (lines 1–95) — full replacement

Replace the entire file with the following:

```tsx
import Image from "next/image";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import type { AcademyEntryContext } from "@/lib/academy-entry";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "./academy-entry.module.css";

export function AcademyLoginPage({
  customDomain = false,
  data,
}: {
  customDomain?: boolean;
  data: AcademyEntryContext;
}) {
  const logo = getPortalBrandingUrl(data.portal.logo_path);
  const routeContext = { portalSlug: data.portal.slug, customDomain };
  const homeHref = getAcademyEntryHref(routeContext, "home");
  const joinHref = getAcademyEntryHref(routeContext, "join-academy");
  const studentDestination = getAcademyEntryHref(routeContext, "academy");
  const platformOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const setupHref =
    customDomain && platformOrigin
      ? new URL("/account-setup", platformOrigin).toString()
      : "/account-setup";
  const recoveryHref =
    customDomain && platformOrigin
      ? new URL("/recover", platformOrigin).toString()
      : "/recover";
  const mentorDashboardHref = "/dashboard";
  const isSubscription = data.portal.access_model === "subscription";
  const theme = {
    "--academy-primary": data.portal.primary_color,
    "--academy-accent": data.portal.accent_color,
  } as React.CSSProperties;

  return (
    <main
      className={`${styles.page}${isSubscription ? ` ${styles.pageDark}` : ""}`}
      style={theme}
    >
      <section className={styles.shell}>
        <nav className={styles.nav}>
          <Link className={styles.brand} href={homeHref}>
            <span>
              {logo ? (
                <Image
                  alt={`${data.portal.portal_name} logo`}
                  height={48}
                  src={logo}
                  unoptimized
                  width={48}
                />
              ) : (
                data.portal.portal_name.slice(0, 1)
              )}
            </span>
            <strong>{data.portal.portal_name}</strong>
          </Link>
          <div className={styles.navActions}>
            <Link href={homeHref}>← Home</Link>
            <Link className={styles.primaryNav} href={joinHref}>
              {isSubscription ? "Enrol" : "Join Academy"}
            </Link>
          </div>
        </nav>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <LockKeyhole size={28} />
            <p className={styles.eyebrow}>
              {isSubscription ? "Student login" : "Academy login"}
            </p>
            <h2>Welcome back</h2>
            <p>
              {isSubscription
                ? `Sign in to ${data.portal.portal_name}. Use the email and password you registered with.`
                : `Sign in to ${data.portal.portal_name}. Students and mentors of this academy can sign in here.`}
            </p>
          </div>
          <LoginForm
            academyContext={{
              traderId: data.portal.trader_id,
              studentDestination,
              mentorDestination: mentorDashboardHref,
              customDomain,
            }}
            submitLabel="Sign In"
          />
          <p className={styles.footerNote}>
            <Link href={setupHref}>Resume account setup</Link> ·{" "}
            <Link href={recoveryHref}>Forgot password</Link>
          </p>
          {!isSubscription && (
            <div className={styles.partnerBadge}>
              <Image
                alt="XM Global"
                height={18}
                src="/images/xm-global-logo.svg"
                unoptimized
                width={60}
              />
              <span>Partnered with XM Global</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
```

---

## Step 6 — `components/student-registration-form.tsx`

This is the most significant change. Replace the entire file with the following:

```tsx
"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./student-registration-form.module.css";

interface RegistrationFormProps {
  portalSlug: string;
  primaryColor: string;
  loginPath?: string;
  academyName?: string;
  studentDestination?: string;
  accessModel?: "verification" | "subscription";
}

const TRADING_LEVELS = [
  { value: "beginner", label: "Beginner", desc: "Just starting out — learning the basics" },
  { value: "intermediate", label: "Intermediate", desc: "Consistent practice, refining a strategy" },
  { value: "advanced", label: "Advanced", desc: "Profitable, working on psychology & scale" },
  { value: "funded", label: "Funded Trader", desc: "Trading a prop or funded account" },
] as const;

const AI_LEVELS = [
  { value: "beginner", label: "Beginner", desc: "New to AI tools — exploring what's possible" },
  { value: "intermediate", label: "Intermediate", desc: "Using AI tools regularly, building workflows" },
  { value: "advanced", label: "Advanced", desc: "Building products and automations with AI" },
] as const;

export function StudentRegistrationForm({
  portalSlug,
  primaryColor,
  loginPath,
  academyName,
  studentDestination = "/student",
  accessModel = "verification",
}: RegistrationFormProps) {
  const isSubscription = accessModel === "subscription";
  const STEPS = isSubscription
    ? (["Profile", "About You", "Review"] as const)
    : (["Profile", "Experience", "Review"] as const);
  type StepIndex = 0 | 1 | 2;

  const [step, setStep] = useState<StepIndex>(0);
  const [loading, setLoading] = useState(false);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [otpScreen, setOtpScreen] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step 1 — Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  // Step 2 — Experience / About You
  const [tradingLevel, setTradingLevel] = useState("");
  const [yearsTrading, setYearsTrading] = useState("");
  const [tradingChallenge, setTradingChallenge] = useState("");
  const [notificationsOptIn, setNotificationsOptIn] = useState(false);

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
    if (isSubscription) {
      formData.set("province", province);
      formData.set("country", country);
      formData.set("notificationsOptIn", notificationsOptIn ? "on" : "off");
    }
    try {
      const response = await fetch("/api/student/register", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Registration could not be completed.");
      const resolvedEmail = String(payload.email ?? formData.get("email")).trim().toLowerCase();
      setSubmittedEmail(resolvedEmail);
      const wasExisting = payload.existingUser === true;
      setIsExistingUser(wasExisting);
      setOtpScreen(true);
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
        email: submittedEmail,
        token: otpCode.trim(),
        type: isExistingUser ? "email" : "signup",
      });
      if (error) throw new Error("The code is incorrect or has expired. Try again or request a new code.");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: submittedEmail }),
    });
  }

  if (otpScreen) {
    return (
      <div className={styles.otpScreen}>
        <CheckCircle2 size={42} style={{ color: primaryColor }} />
        <h2>{isExistingUser ? "Welcome back — check your inbox" : "Check your inbox"}</h2>
        <p>We sent a 6-digit code to <strong>{submittedEmail}</strong>.</p>
        <div className={styles.field}>
          <label htmlFor="srf_otp">Verification code</label>
          <input
            autoComplete="one-time-code"
            className={styles.codeInput}
            id="srf_otp"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
            pattern="\d{6}"
            placeholder="000000"
            value={otpCode}
          />
        </div>
        {otpError && <p className={styles.error}>{otpError}</p>}
        <button
          disabled={otpCode.length !== 6 || otpLoading}
          onClick={verifyOtp}
          style={otpCode.length === 6 ? { background: primaryColor } : undefined}
          type="button"
        >
          {otpLoading ? <Loader2 className={styles.spin} size={18} /> : null}
          Verify and continue
        </button>
        <button className={styles.resendBtn} onClick={resendOtp} type="button">
          Resend code
        </button>
      </div>
    );
  }

  const LEVELS = isSubscription ? AI_LEVELS : TRADING_LEVELS;

  return (
    <form action={submit} className={styles.form}>
      {/* Hidden inputs carry state values into FormData at submission */}
      <input type="hidden" name="fullName" value={fullName} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="phoneNumber" value={phoneNumber} />
      <input type="hidden" name="tradingLevel" value={tradingLevel} />
      {!isSubscription && (
        <>
          <input type="hidden" name="yearsTrading" value={yearsTrading} />
          <input type="hidden" name="tradingChallenge" value={tradingChallenge} />
        </>
      )}
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
            <span
              className={styles.dotLabel}
              style={i === step ? { color: "#22272b", fontWeight: 750 } : undefined}
            >
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
            <input
              autoComplete="name"
              id="srf_fullName"
              onChange={(e) => setFullName(e.target.value)}
              required
              value={fullName}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_email">Email address</label>
            <input
              autoComplete="email"
              id="srf_email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="srf_phone">Phone number</label>
            <input
              id="srf_phone"
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+27 82 000 0000"
              required
              type="tel"
              value={phoneNumber}
            />
          </div>
          {isSubscription && (
            <>
              <div className={styles.field}>
                <label htmlFor="srf_province">Province / State</label>
                <input
                  autoComplete="address-level1"
                  id="srf_province"
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="e.g. Gauteng"
                  value={province}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="srf_country">Country</label>
                <input
                  autoComplete="country-name"
                  id="srf_country"
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. South Africa"
                  value={country}
                />
              </div>
            </>
          )}
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
          {password.length >= 10 &&
            passwordConfirmation.length > 0 &&
            password !== passwordConfirmation && (
              <p className={styles.fieldHint}>Passwords do not match.</p>
            )}
          <p className={styles.stepNote}>
            You&apos;ll use this password to sign in after verifying your email.
          </p>
        </>
      )}

      {/* Step 2 — Experience / About You */}
      {step === 1 && (
        <>
          <p className={styles.levelPrompt}>
            {isSubscription ? "What best describes your AI experience?" : "Where are you right now?"}
          </p>
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
          {!isSubscription && (
            <>
              <div className={styles.field}>
                <label htmlFor="srf_years">How long have you been trading?</label>
                <select
                  id="srf_years"
                  onChange={(e) => setYearsTrading(e.target.value)}
                  value={yearsTrading}
                >
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
          {isSubscription && (
            <label className={styles.consent} style={{ marginTop: "12px" }}>
              <input
                checked={notificationsOptIn}
                name="notificationsOptIn"
                onChange={(e) => setNotificationsOptIn(e.target.checked)}
                type="checkbox"
              />
              <span>Send me updates about new lessons, tools, and features.</span>
            </label>
          )}
        </>
      )}

      {/* Step 3 — Review */}
      {step === 2 && (
        <>
          <div className={styles.reviewBox}>
            <strong>What happens next</strong>
            <p>
              After submitting, you&apos;ll receive a 6-digit code by email. Enter it on the
              next screen to activate your account and sign in to your{" "}
              {isSubscription ? "student dashboard" : "student dashboard"}.
            </p>
          </div>
          {isSubscription ? (
            <div className={styles.disclaimerCard}>
              <strong>Before you submit</strong>
              <p>
                All content provided through {academyName ?? "this academy"} is for educational
                purposes only and does not constitute professional, financial, or legal advice.
                You are responsible for your own decisions and actions based on what you learn here.
              </p>
            </div>
          ) : (
            <div className={styles.disclaimerCard}>
              <strong>⚠ Important — please read before submitting</strong>
              <p>
                Trading financial instruments involves substantial risk of loss and is not suitable
                for all investors. Past performance is not indicative of future results. All content
                provided through this academy is strictly educational and does not constitute
                financial advice. You are solely responsible for any trading decisions you make.
              </p>
            </div>
          )}
          <label className={styles.consent}>
            <input
              checked={consentChecked}
              name="consent"
              onChange={(e) => setConsentChecked(e.target.checked)}
              required
              type="checkbox"
            />
            {isSubscription ? (
              <span>
                I have read and understood the above. I agree that all content is educational only
                and I accept full responsibility for my own decisions.
              </span>
            ) : (
              <span>
                I have read and understood the above. I consent to my trading account being verified
                against the academy&apos;s connected broker(s) when I submit my verification details
                from the student portal. I accept full responsibility for my own trading decisions.
              </span>
            )}
          </label>
          {submitError && <p className={styles.error}>{submitError}</p>}
        </>
      )}

      {/* Navigation */}
      <div className={styles.navRow}>
        {step > 0 && (
          <button
            className={styles.backBtn}
            onClick={() => setStep((s) => (s - 1) as StepIndex)}
            type="button"
          >
            <ChevronLeft size={16} />
            Back
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
            Next
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            className={styles.submit}
            disabled={loading || !consentChecked}
            style={{ background: primaryColor }}
            type="submit"
          >
            {loading ? <Loader2 className={styles.spin} size={18} /> : null}
            {isSubscription ? "Create Account" : "Join Academy"}
          </button>
        )}
      </div>
    </form>
  );
}
```

---

## Step 7 — `app/api/student/register/route.ts`

### 7a. Extend the Zod schema

The current schema (lines 14–29) does not include `province`, `country`, or `notifications_opt_in`. Add these three optional fields inside the `z.object({...})`:

```ts
  province: z.string().max(80).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  notificationsOptIn: z.enum(["on", "off"]).optional(),
```

### 7b. Parse the new fields from `formData`

Inside `POST()`, after parsing `tradingChallenge` from formData (around line 90), also parse:

```ts
  province: formData.get("province")?.toString() || null,
  country: formData.get("country")?.toString() || null,
  notificationsOptIn: (formData.get("notificationsOptIn")?.toString() as "on" | "off") ?? "off",
```

### 7c. Add new fields to both `student_applications` inserts

There are **two** `student_applications` inserts in this file:
- Line ~156 (existing-user path)
- Line ~211 (new-user path)

Add these fields to **both** insert objects:

```ts
  province: input.province ?? null,
  country: input.country ?? null,
  notifications_opt_in: input.notificationsOptIn === "on",
```

No other changes to this file.

---

## Acceptance Criteria

Engineer confirms all of the following with direct evidence (output/screenshots):

1. **Migration applied** — query `select column_name from information_schema.columns where table_name = 'student_applications' and column_name in ('province','country','notifications_opt_in');` returns all three rows.

2. **Existing portal unaffected** — visit `app.kaimentors.com/academy/kaitrades/join` (or KaiTrades custom domain). Confirm:
   - White/light background still renders
   - XM Global badge is visible
   - Step 2 shows "Funded Trader" level option
   - Trading years and challenge fields appear

3. **KSI enrol page** — visit KSI join-academy URL. Confirm:
   - Dark background (`#06060E`) renders
   - XM badge is NOT present
   - Eyebrow reads "Enrolment"
   - Step 2 heading reads "What best describes your AI experience?"
   - Level cards show Beginner / Intermediate / Advanced (no "Funded Trader")
   - Province and Country fields appear in Step 1
   - Notifications opt-in checkbox appears in Step 2
   - Submit button reads "Create Account"
   - Review step shows educational disclaimer (no financial trading language)

4. **KSI sign-in page** — visit KSI login URL. Confirm:
   - Dark background renders
   - XM badge is NOT present
   - Eyebrow reads "Student login"
   - Nav CTA reads "Enrol"

5. **TypeScript builds clean** — `npx tsc --noEmit` passes with no new errors.

6. **Successful test registration on KSI** — complete registration flow with a test email. Confirm:
   - OTP is received and verification succeeds
   - Row inserted in `student_applications` with correct `province`, `country`, `notifications_opt_in` values (query to confirm)

---

## Notes

- `trading_level` column on `student_applications` is reused for AI experience level in subscription portals — semantically different but the column is text and stores the value correctly. No column rename required.
- `student-registration-form.module.css` is not touched in this MB. The form renders inside the academy card — if input field colours need adjustment for dark backgrounds in a future polish pass, that is a separate MB.
- KSI portal is currently `is_published = false`. These pages can be tested via the platform slug route (`/academy/[slug]/join-academy`) before the domain is live.
