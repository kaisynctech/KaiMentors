"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./affiliate-dashboard.module.css";

export const PROMO_CHANNELS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "LinkedIn",
  "X (Twitter)",
  "YouTube",
  "WhatsApp",
  "Website or blog",
  "Email list",
  "Friends and family",
  "Other",
];

export const COUNTRIES = [
  "South Africa", "Botswana", "Namibia", "Zimbabwe", "Zambia", "Mozambique", "Lesotho", "Eswatini",
  "Nigeria", "Ghana", "Kenya", "Uganda", "Tanzania", "Rwanda", "Egypt", "Morocco",
  "United Kingdom", "Ireland", "United States", "Canada", "Australia", "New Zealand",
  "Germany", "France", "Netherlands", "Belgium", "Spain", "Portugal", "Italy", "Sweden", "Norway", "Denmark", "Switzerland", "Poland",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "India", "Pakistan", "Philippines", "Singapore", "Malaysia",
  "Brazil", "Mexico", "Other",
];

type Tab = { id: string; label: string; content: ReactNode };

export function AffiliateFrame({
  themeKey,
  brand,
  actions,
  intro,
  tabs,
  children,
}: {
  themeKey: string;
  brand: ReactNode;
  actions: ReactNode;
  intro: ReactNode;
  tabs?: Tab[];
  children?: ReactNode;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [active, setActive] = useState(tabs?.[0]?.id ?? "");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(themeKey);
      if (saved === "light" || saved === "dark") setTheme(saved);
      else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) setTheme("light");
    } catch {
      // Storage can be blocked; dark stays the default.
    }
    const hash = window.location.hash.replace("#", "");
    if (tabs?.some((tab) => tab.id === hash)) setActive(hash);
  }, [themeKey, tabs]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(themeKey, next);
    } catch {
      // Ignore blocked storage.
    }
  }

  function pick(id: string) {
    setActive(id);
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {
      // Ignore.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className={styles.shell} data-theme={theme}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          {brand}
          <div className={styles.topActions}>
            <button
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className={styles.iconBtn}
              onClick={toggleTheme}
              type="button"
            >
              {theme === "dark" ? (
                <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" /><path d="M12 1.5v2.5M12 20v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M1.5 12H4M20 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" /></svg>
              ) : (
                <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
            {actions}
          </div>
        </div>
      </header>
      <main className={styles.main}>
        {intro}
        {tabs && tabs.length > 0 ? (
          <>
            <div aria-label="Affiliate sections" className={styles.tabs} role="tablist">
              {tabs.map((tab) => (
                <button
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={active === tab.id}
                  className={styles.tab}
                  id={`tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => pick(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {tabs.map((tab) => (
              <section
                aria-labelledby={`tab-${tab.id}`}
                hidden={active !== tab.id}
                id={`panel-${tab.id}`}
                key={tab.id}
                role="tabpanel"
              >
                {tab.content}
              </section>
            ))}
          </>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function CopyRow({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const [absolute, setAbsolute] = useState(value);

  useEffect(() => {
    try {
      setAbsolute(new URL(value, window.location.origin).toString());
    } catch {
      setAbsolute(value);
    }
  }, [value]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(absolute);
      setState("done");
    } catch {
      setState("fail");
    }
    window.setTimeout(() => setState("idle"), 2200);
  }

  async function share() {
    try {
      await navigator.share({ url: absolute, title: label });
    } catch {
      // The person closed the share sheet.
    }
  }

  return (
    <>
      <div className={styles.copyRow}>
        <span className={styles.copyField} title={absolute}>{absolute}</span>
        <button className={styles.btn} onClick={copy} type="button">
          {state === "done" ? "Copied ✓" : `Copy ${label.toLowerCase()}`}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={share} type="button">
            Share
          </button>
        ) : null}
      </div>
      {state === "fail" ? <p className={styles.hint}>Copy blocked. Press and hold the link above to copy it.</p> : null}
    </>
  );
}

function Select({ name, options, value, onChange }: { name: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <select name={name} onChange={(event) => onChange(event.target.value)} required value={value}>
      <option disabled value="">Choose…</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

export function AffiliateProfileForm({
  portalSlug,
  initial,
}: {
  portalSlug: string;
  initial: { fullName: string; email: string; phone: string; country: string; promoChannel: string; promoLink: string };
}) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ good: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/referrals/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portalSlug, ...form }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save your profile.");
      setMessage({ good: true, text: "Profile saved." });
    } catch (error) {
      setMessage({ good: false, text: error instanceof Error ? error.message : "Could not save your profile." });
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form className={styles.form} onSubmit={save}>
      <div className={styles.formGrid}>
        <label className={styles.field}>Full name<input minLength={2} onChange={(e) => set("fullName")(e.target.value)} required value={form.fullName} /></label>
        <label className={styles.field}>Email<input readOnly value={form.email} /></label>
        <label className={styles.field}>Phone<input inputMode="tel" onChange={(e) => set("phone")(e.target.value)} placeholder="+27 …" required value={form.phone} /></label>
        <label className={styles.field}>Country<Select name="country" onChange={set("country")} options={COUNTRIES} value={form.country} /></label>
        <label className={styles.field}>Main promotion channel<Select name="promoChannel" onChange={set("promoChannel")} options={PROMO_CHANNELS} value={form.promoChannel} /></label>
        <label className={styles.field}>Website or profile link <input onChange={(e) => set("promoLink")(e.target.value)} placeholder="https://" type="url" value={form.promoLink} /></label>
      </div>
      {message ? <p className={`${styles.msg} ${message.good ? styles.msgGood : styles.msgBad}`}>{message.text}</p> : null}
      <div><button className={styles.btn} disabled={saving} type="submit">{saving ? "Saving…" : "Save profile"}</button></div>
    </form>
  );
}

/** Shown to a signed-in person who has no affiliate profile yet. */
export function AffiliateJoinForm({
  portalSlug,
  fullName,
  email,
  termsHref,
}: {
  portalSlug: string;
  fullName: string;
  email: string;
  termsHref: string;
}) {
  const [form, setForm] = useState({ fullName, phone: "", country: "", promoChannel: "", promoLink: "" });
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/referrals/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portalSlug, ...form, acceptTerms: accept }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create your affiliate profile.");
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create your affiliate profile.");
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.formGrid}>
        <label className={styles.field}>Full name<input minLength={2} onChange={(e) => set("fullName")(e.target.value)} required value={form.fullName} /></label>
        <label className={styles.field}>Email<input readOnly value={email} /></label>
        <label className={styles.field}>Phone<input inputMode="tel" onChange={(e) => set("phone")(e.target.value)} placeholder="+27 …" required value={form.phone} /></label>
        <label className={styles.field}>Country<Select name="country" onChange={set("country")} options={COUNTRIES} value={form.country} /></label>
        <label className={styles.field}>Main promotion channel<Select name="promoChannel" onChange={set("promoChannel")} options={PROMO_CHANNELS} value={form.promoChannel} /></label>
        <label className={styles.field}>Website or profile link (optional)<input onChange={(e) => set("promoLink")(e.target.value)} placeholder="https://" type="url" value={form.promoLink} /></label>
      </div>
      <label className={styles.check}>
        <input checked={accept} onChange={(e) => setAccept(e.target.checked)} required type="checkbox" />
        <span>I agree to the <a href={termsHref} rel="noreferrer" target="_blank">affiliate terms</a>, including no self-referrals and no misleading promotion.</span>
      </label>
      {error ? <p className={`${styles.msg} ${styles.msgBad}`}>{error}</p> : null}
      <div><button className={styles.btn} disabled={loading} type="submit">{loading ? "Creating…" : "Create my affiliate profile"}</button></div>
    </form>
  );
}
