"use client";

import { CheckCircle2, Loader2, MailCheck, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useOtpCooldown } from "@/lib/use-otp-cooldown";
import styles from "./auth-form.module.css";

type Step = "email" | "code" | "password" | "complete" | "sign_in" | "expired" | "support";

export function AccountSetupFlow() {
  const cooldown = useOtpCooldown();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [academyName, setAcademyName] = useState<string | null>(null);
  const [destination, setDestination] = useState("/login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = window.sessionStorage.getItem("kaimentors.accountSetupEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      window.sessionStorage.removeItem("kaimentors.accountSetupEmail");
    }
  }, []);

  async function start(nextEmail: string) {
    const response = await fetch("/api/account-setup/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: nextEmail }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Account setup could not be started.");
    setEmail(nextEmail);
    setSetupToken(payload.setupToken);
    setMessage(payload.message);
    cooldown.start(payload.retryAfterSeconds ?? 60);
    setStep("code");
  }

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      if (step === "email") {
        await start(String(formData.get("email")).trim().toLowerCase());
        return;
      }
      const supabase = createClient();
      if (step === "code") {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: String(formData.get("code")).trim(),
          type: "email",
        });
        if (error || !data.user || !data.session?.access_token) {
          throw new Error("The verification code is invalid or expired.");
        }
        const response = await fetch("/api/account-setup/verify", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ setupToken }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Account setup could not be verified.");
        setAcademyName(payload.academyName);
        setStep(payload.action === "create_password"
          ? "password"
          : payload.action === "sign_in"
            ? "sign_in"
            : payload.action === "invitation_expired"
              ? "expired"
              : "support");
        return;
      }
      if (step === "password") {
        const password = String(formData.get("password"));
        if (password !== String(formData.get("passwordConfirmation"))) {
          throw new Error("The passwords do not match.");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error("Your password could not be saved.");
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) throw new Error("Your verified session expired.");
        const response = await fetch("/api/account-setup/complete", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ setupToken }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Account setup could not be completed.");
        setDestination(payload.destination ?? "/login");
        setStep("complete");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account setup could not continue.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setMessage("");
    try {
      await start(email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A new code could not be sent.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "complete") {
    return <div className={styles.form}><CheckCircle2 size={34} /><h2>Setup complete</h2><p>{academyName ? `${academyName} is ready.` : "Your account is ready."}</p><Link href={destination}>Continue securely</Link></div>;
  }
  if (step === "sign_in") {
    return <div className={styles.form}><ShieldCheck size={34} /><h2>Your account is already set up</h2><p>Use your password to sign in, or request a recovery code if you have forgotten it.</p><Link href="/login">Sign in</Link><Link href="/recover">Forgot password</Link></div>;
  }
  if (step === "expired") {
    return <div className={styles.form}><MailCheck size={34} /><h2>Your setup invitation needs renewal</h2><p>Your email is verified, but a platform administrator must renew the invitation before setup can finish. Your existing academy and website records are safe.</p><Link href="/login">Return to sign in</Link></div>;
  }
  if (step === "support") {
    return <div className={styles.form}><ShieldCheck size={34} /><h2>Account review required</h2><p>We could not safely continue this account automatically. Contact platform support so the existing account can be reviewed without creating a duplicate.</p><Link href="/login">Return to sign in</Link></div>;
  }

  return (
    <form action={submit} className={styles.form}>
      {step === "email" ? <><h2>Resume account setup</h2><p>Enter the email used for your workspace or academy invitation.</p><label>Email address<input autoComplete="email" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label></> : null}
      {step === "code" ? <><div className={styles.codeIntro}><MailCheck size={22} /><div><strong>Check your email</strong><span>If this address matches an account that can be continued, we sent a six-digit code.</span></div></div><label>Verification code<input autoComplete="one-time-code" className={styles.codeInput} inputMode="numeric" maxLength={6} minLength={6} name="code" pattern="[0-9]{6}" placeholder="000000" required /></label></> : null}
      {step === "password" ? <><h2>Create your password</h2><p>Your email is verified. Choose the password you will use to sign in.</p><label>New password<input autoComplete="new-password" minLength={10} name="password" required type="password" /></label><label>Confirm password<input autoComplete="new-password" minLength={10} name="passwordConfirmation" required type="password" /></label></> : null}
      {message ? <p className={styles.error}>{message}</p> : null}
      <button disabled={loading} type="submit">{loading ? <Loader2 className={styles.spin} size={18} /> : null}{step === "email" ? "Continue account setup" : step === "code" ? "Verify code" : "Complete setup"}</button>
      {step === "code" ? <button className={styles.backButton} disabled={loading || cooldown.seconds > 0} onClick={resend} type="button"><RotateCcw size={15} /> {cooldown.seconds > 0 ? `Resend in ${cooldown.seconds}s` : "Resend code"}</button> : null}
      {step === "email" ? <><Link href="/onboarding">Create a new mentor workspace</Link><Link href="/login">Return to sign in</Link></> : null}
    </form>
  );
}
