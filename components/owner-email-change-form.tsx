"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { requestAuthChallenge } from "@/lib/auth-challenge-client";
import { createClient } from "@/lib/supabase/browser";
import { useOtpCooldown } from "@/lib/use-otp-cooldown";
import styles from "./auth-form.module.css";

export function OwnerEmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const cooldown = useOtpCooldown();
  const [newEmail, setNewEmail] = useState("");
  const [step, setStep] = useState<"request" | "verify" | "complete">("request");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setLoading(true); setMessage("");
    try {
      if (step === "request") {
        const nextEmail = String(formData.get("newEmail")).trim().toLowerCase();
        if (nextEmail === currentEmail.toLowerCase()) throw new Error("Enter a different email address.");
        const result = await requestAuthChallenge(nextEmail, "email_change");
        cooldown.start(result.retryAfterSeconds ?? 60);
        setNewEmail(nextEmail); setStep("verify");
      } else {
        const supabase = createClient();
        const currentCode = String(formData.get("currentCode")).trim();
        const newCode = String(formData.get("newCode")).trim();
        const currentResult = await supabase.auth.verifyOtp({ email: currentEmail, token: currentCode, type: "email_change" });
        if (currentResult.error) throw new Error("The code sent to your current email is invalid or expired.");
        const newResult = await supabase.auth.verifyOtp({ email: newEmail, token: newCode, type: "email_change" });
        if (newResult.error) throw new Error("The code sent to your new email is invalid or expired.");
        const response = await fetch("/api/auth/email-change/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newEmail }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "The email change could not be completed.");
        setStep("complete"); setMessage("Your account email has been updated.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "The email change could not be completed."); }
    finally { setLoading(false); }
  }

  async function resend() {
    setLoading(true); setMessage("");
    try { const result = await requestAuthChallenge(newEmail, "email_change", true); cooldown.start(result.retryAfterSeconds ?? 60); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The codes could not be resent."); }
    finally { setLoading(false); }
  }

  if (step === "complete") return <div className={styles.success}><h2>Email updated</h2><p>{message}</p></div>;
  return <form action={submit} className={styles.form}><h2>Account email</h2><p>Current email: {currentEmail}</p>{step === "request" ? <label>New email address<input autoComplete="email" name="newEmail" required type="email" /></label> : <><p>Enter both six-digit codes. They expire in 15 minutes.</p><label>Code sent to current email<input autoComplete="one-time-code" className={styles.codeInput} inputMode="numeric" maxLength={6} minLength={6} name="currentCode" pattern="[0-9]{6}" required /></label><label>Code sent to new email<input autoComplete="one-time-code" className={styles.codeInput} inputMode="numeric" maxLength={6} minLength={6} name="newCode" pattern="[0-9]{6}" required /></label></>}{message ? <p className={styles.error}>{message}</p> : null}<button disabled={loading} type="submit">{loading ? <Loader2 className={styles.spin} size={18} /> : null}{step === "request" ? "Send confirmation codes" : "Confirm email change"}</button>{step === "verify" ? <button className={styles.backButton} disabled={loading || cooldown.seconds > 0} onClick={resend} type="button"><RotateCcw size={15} /> {cooldown.seconds > 0 ? `Resend in ${cooldown.seconds}s` : "Resend confirmation codes"}</button> : null}</form>;
}
