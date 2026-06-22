"use client";

import { ExternalLink, Loader2, UploadCloud } from "lucide-react";
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

export function StudentRegistrationForm({ portalSlug, brokers, primaryColor }: RegistrationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const selectedBroker = useMemo(
    () => brokers.find((broker) => broker.connectionId === selectedBrokerId),
    [brokers, selectedBrokerId],
  );

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    try {
      formData.set("portalSlug", portalSlug);
      const response = await fetch("/api/student/register", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Registration could not be completed.");
      const email = String(payload.email ?? formData.get("email")).trim().toLowerCase();
      window.sessionStorage.setItem("kaimentors.accountSetupEmail", email);
      router.push("/account-setup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  return <form action={submit} className={styles.form}>
    <div className={styles.field}><label htmlFor="fullName">Full name</label><input autoComplete="name" id="fullName" name="fullName" required /></div>
    <div className={styles.field}><label htmlFor="email">Email address</label><input autoComplete="email" id="email" name="email" required type="email" /></div>
    <div className={styles.field}><label htmlFor="phoneNumber">Phone number</label><input id="phoneNumber" name="phoneNumber" placeholder="+27 82 000 0000" required type="tel" /></div>
    <p>Your password will be created only after your email address is verified.</p>
    <div className={styles.field}><label htmlFor="brokerConnectionId">Broker</label><select id="brokerConnectionId" name="brokerConnectionId" onChange={(event) => setSelectedBrokerId(event.target.value)} required value={selectedBrokerId}><option value="">Select your broker</option>{brokers.map((broker) => <option key={broker.connectionId} value={broker.connectionId}>{broker.name}</option>)}</select>{selectedBroker ? <small>Verification: {selectedBroker.verificationMethod.replace(/_/g, " ")}</small> : null}</div>
    <div className={styles.field}><label htmlFor="tradingAccountNumber">Trading account number</label><input autoComplete="off" id="tradingAccountNumber" name="tradingAccountNumber" required /></div>
    <div className={styles.field}><label htmlFor="platformAccountNumber">MT4/MT5 number</label><input autoComplete="off" id="platformAccountNumber" name="platformAccountNumber" required /><small>Enter the login number shown in MT4 or MT5.</small></div>
    <label className={styles.upload}><UploadCloud size={20} /><span><strong>Screenshot proof</strong><small>Optional PNG, JPG, or WebP up to 10 MB.</small></span><input accept="image/png,image/jpeg,image/webp" name="screenshotProof" type="file" /></label>
    {selectedBroker?.affiliateLink ? <a className={styles.affiliate} href={selectedBroker.affiliateLink} rel="noreferrer" target="_blank">Open an account with {selectedBroker.name}<ExternalLink size={15} /></a> : null}
    <label className={styles.consent}><input name="consent" required type="checkbox" /><span>I consent to my account details being checked with the selected broker for affiliate verification.</span></label>
    {message ? <p className={styles.error}>{message}</p> : null}
    <button className={styles.submit} disabled={loading || brokers.length === 0} style={{ background: primaryColor }} type="submit">{loading ? <Loader2 className={styles.spin} size={18} /> : null}Join Academy</button>
    {brokers.length === 0 ? <p className={styles.error}>This academy has not enabled registration yet.</p> : null}
  </form>;
}
