"use client";

import Link from "next/link";
import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { requestAuthChallenge } from "@/lib/auth-challenge-client";
import { createClient } from "@/lib/supabase/browser";
import { useOtpCooldown } from "@/lib/use-otp-cooldown";
import styles from "./auth-form.module.css";

export function PasswordRecoveryForm() {
  const cooldown = useOtpCooldown();
  const [step, setStep] = useState<"email" | "code" | "password" | "complete">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function requestCode(nextEmail: string, resend = false) {
    const result = await requestAuthChallenge(nextEmail, "recovery", resend);
    cooldown.start(result.retryAfterSeconds ?? 60);
  }

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (step === "email") {
        const nextEmail = String(formData.get("email")).trim().toLowerCase();
        await requestCode(nextEmail);
        setEmail(nextEmail);
        setStep("code");
      } else if (step === "code") {
        const { data, error } = await supabase.auth.verifyOtp({ email, token: String(formData.get("code")).trim(), type: "recovery" });
        if (error || !data.user) throw new Error("The recovery code is invalid or expired.");
        setStep("password");
      } else if (step === "password") {
        const password = String(formData.get("password"));
        if (password !== String(formData.get("passwordConfirmation"))) throw new Error("The passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
          const { data: sessionData } = await supabase.auth.getSession();
          const auditResponse = await fetch("/api/auth/challenges/complete", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(sessionData.session?.access_token
                ? { authorization: `Bearer ${sessionData.session.access_token}` }
                : {}),
            },
          body: JSON.stringify({ purpose: "recovery" }),
        });
        if (!auditResponse.ok) throw new Error("The password changed, but completion could not be recorded.");
        await supabase.auth.signOut({ scope: "local" });
        setStep("complete");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password recovery could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setMessage("");
    try { await requestCode(email, true); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The code could not be resent."); }
    finally { setLoading(false); }
  }

  if (step === "complete") return <div className={styles.success}><h2>Password updated</h2><p>Sign in with your new password.</p><Link href="/login">Return to sign in</Link></div>;
  return (
    <form action={submit} className={styles.form}>
      <h2>Recover your account</h2>
      {step === "email" ? <label>Email address<input autoComplete="email" name="email" required type="email" /></label> : null}
      {step === "code" ? <><p>Enter the six-digit code sent to {email}. It expires in 15 minutes.</p><label>Recovery code<input autoComplete="one-time-code" className={styles.codeInput} inputMode="numeric" maxLength={6} minLength={6} name="code" pattern="[0-9]{6}" required /></label></> : null}
      {step === "password" ? <><label>New password<input autoComplete="new-password" minLength={10} name="password" required type="password" /></label><label>Confirm password<input autoComplete="new-password" minLength={10} name="passwordConfirmation" required type="password" /></label></> : null}
      {message ? <p className={styles.error}>{message}</p> : null}
      <button disabled={loading} type="submit">{loading ? <Loader2 className={styles.spin} size={18} /> : null}{step === "email" ? "Send recovery code" : step === "code" ? "Verify recovery code" : "Set new password"}</button>
      {step === "code" ? <button className={styles.backButton} disabled={loading || cooldown.seconds > 0} onClick={resend} type="button"><RotateCcw size={15} /> {cooldown.seconds > 0 ? `Resend in ${cooldown.seconds}s` : "Resend recovery code"}</button> : null}
    </form>
  );
}
