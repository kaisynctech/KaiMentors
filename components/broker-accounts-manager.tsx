"use client";

import { useState } from "react";
import {
  Braces,
  Camera,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { VerificationMethod } from "@/lib/database.types";
import styles from "./broker-accounts-manager.module.css";

interface BrokerAccount {
  id: string;
  partner_code: string;
  affiliate_link: string | null;
  verification_method: VerificationMethod;
  is_active: boolean;
  broker: { name: string } | null;
}

interface BrokerAccountsManagerProps {
  accounts: BrokerAccount[];
}

const methodLabels: Record<VerificationMethod, string> = {
  api: "API",
  manual_review: "Manual review",
  screenshot_upload: "Screenshot upload",
};

const methodIcons = {
  api: Braces,
  manual_review: ShieldCheck,
  screenshot_upload: Camera,
};

export function BrokerAccountsManager({
  accounts,
}: BrokerAccountsManagerProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error" | "success">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function addBroker(formData: FormData) {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/brokers/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The broker account could not be saved.");
      return;
    }

    setState("success");
    setMessage("Broker account connected.");
    router.refresh();
  }

  async function setActive(accountId: string, isActive: boolean) {
    setUpdatingId(accountId);
    setMessage("");
    const response = await fetch("/api/brokers/accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId, isActive }),
    });
    const payload = await response.json();
    setUpdatingId(null);
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The broker account could not be updated.");
      return;
    }
    setState("success");
    setMessage(isActive ? "Broker account enabled." : "Broker account paused.");
    router.refresh();
  }

  return (
    <div className={styles.layout}>
      <section className={styles.formCard}>
        <div className={styles.heading}>
          <span>New connection</span>
          <h2>Add broker account</h2>
          <p>
            Add any broker your academy supports. API traffic remains on the
            server and is never sent from the browser.
          </p>
        </div>
        <form action={addBroker}>
          <label>
            Broker name
            <input
              maxLength={120}
              name="brokerName"
              placeholder="Broker name"
              required
            />
          </label>
          <label>
            Partner code
            <input
              maxLength={160}
              name="partnerCode"
              placeholder="Your affiliate or partner code"
              required
            />
          </label>
          <label>
            Affiliate link
            <input
              maxLength={1000}
              name="affiliateLink"
              placeholder="https://broker.example/register?ref=..."
              required
              type="url"
            />
          </label>
          <label>
            Verification method
            <select defaultValue="manual_review" name="verificationMethod">
              <option value="api">API</option>
              <option value="manual_review">Manual review</option>
              <option value="screenshot_upload">Screenshot upload</option>
            </select>
          </label>
          <div className={styles.methodNote}>
            <ShieldCheck size={17} />
            API verification uses the existing server-side adapter layer.
            Credentials are never stored in this form.
          </div>
          <button disabled={state === "saving"} type="submit">
            {state === "saving" ? (
              <Loader2 className={styles.spin} size={18} />
            ) : null}
            Add broker account
          </button>
        </form>
        {message ? (
          <p className={state === "error" ? styles.error : styles.success}>
            {state === "success" ? <CheckCircle2 size={17} /> : null}
            {message}
          </p>
        ) : null}
      </section>

      <section className={styles.accounts}>
        <div className={styles.listHeading}>
          <div>
            <span>Connected brokers</span>
            <h2>{accounts.length} account{accounts.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
        {accounts.length ? (
          <div className={styles.list}>
            {accounts.map((account) => {
              const Icon = methodIcons[account.verification_method];
              return (
                <article className={styles.account} key={account.id}>
                  <div className={styles.accountTop}>
                    <div className={styles.brokerIcon}>
                      {(account.broker?.name ?? "B").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h3>{account.broker?.name ?? "Broker"}</h3>
                      <span>
                        {account.is_active ? "Active" : "Paused"} · Partner{" "}
                        {account.partner_code}
                      </span>
                    </div>
                    <span
                      className={
                        account.is_active ? styles.active : styles.paused
                      }
                    >
                      {account.is_active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className={styles.accountMeta}>
                    <div>
                      <Icon size={17} />
                      <span>
                        <small>Verification</small>
                        <strong>
                          {methodLabels[account.verification_method]}
                        </strong>
                      </span>
                    </div>
                    {account.affiliate_link ? (
                      <a
                        href={account.affiliate_link}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Affiliate link <ExternalLink size={15} />
                      </a>
                    ) : null}
                  </div>
                  <button
                    className={styles.toggle}
                    disabled={updatingId === account.id}
                    onClick={() => setActive(account.id, !account.is_active)}
                    type="button"
                  >
                    {updatingId === account.id ? (
                      <Loader2 className={styles.spin} size={16} />
                    ) : null}
                    {account.is_active ? "Pause account" : "Enable account"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <ShieldCheck size={28} />
            <h3>No broker accounts connected</h3>
            <p>
              Add your first broker to enable student applications on the
              public portal.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
