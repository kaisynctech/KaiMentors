"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./auth-form.module.css";

export function MentorOnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const portalPrefix = (() => {
    const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configuredUrl) return "your-domain.com/portal/";
    try { return `${new URL(configuredUrl).host}/portal/`; } catch { return "your-domain.com/portal/"; }
  })();

  async function submitDetails(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/trader/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Your workspace could not be created.");
      const email = String(payload.email ?? formData.get("email")).trim().toLowerCase();
      window.sessionStorage.setItem("kaimentors.accountSetupEmail", email);
      router.push("/account-setup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your workspace could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return <form action={submitDetails} className={styles.form}>
    <div className={styles.twoColumns}><label>Full name<input autoComplete="name" name="fullName" required /></label><label>Academy name<input name="displayName" required /></label></div>
    <label>Legal or business name<input name="legalName" required /></label>
    <label>Portal address<span className={styles.slugField}><small>{portalPrefix}</small><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="your-academy" required /></span></label>
    <label>Email address<input autoComplete="email" name="email" required type="email" /></label>
    <p>Your password will be created only after your email address is verified.</p>
    {message ? <p className={styles.error}>{message}</p> : null}
    <button disabled={loading} type="submit">{loading ? <Loader2 className={styles.spin} size={18} /> : null}Create mentor workspace</button>
  </form>;
}
