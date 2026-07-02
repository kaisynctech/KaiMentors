"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, ImagePlus, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "./portal-branding-form.module.css";

interface PortalBrandingFormProps {
  initialPortal: {
    portal_name: string;
    slug: string;
    logo_path: string | null;
    primary_color: string;
    accent_color: string;
    hero_title: string;
    hero_subtitle: string | null;
    welcome_message: string;
    whatsapp_number: string | null;
    telegram_url: string | null;
    instagram_url: string | null;
    cta_label: string;
    broker_cta_label: string;
    is_published: boolean;
    academy_description: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    facebook_url:  string | null;
    youtube_url:   string | null;
    twitter_url:   string | null;
    tiktok_url:    string | null;
    linkedin_url:  string | null;
    risk_disclosure_template_id: string;
    risk_disclosure_enabled: boolean;
  };
  riskTemplates: Array<{ id: string; title: string; message: string }>;
}

export function PortalBrandingForm({
  initialPortal,
  riskTemplates,
}: PortalBrandingFormProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [logoPath, setLogoPath] = useState(initialPortal.logo_path);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    getPortalBrandingUrl(initialPortal.logo_path),
  );
  const [values, setValues] = useState({
    portalName: initialPortal.portal_name,
    slug: initialPortal.slug,
    primaryColor: initialPortal.primary_color,
    accentColor: initialPortal.accent_color,
    heroTitle: initialPortal.hero_title,
    heroSubtitle: initialPortal.hero_subtitle ?? "",
    welcomeMessage: initialPortal.welcome_message,
    whatsappNumber: initialPortal.whatsapp_number ?? "",
    telegramUrl: initialPortal.telegram_url ?? "",
    instagramUrl: initialPortal.instagram_url ?? "",
    contactPhone: initialPortal.contact_phone ?? "",
    facebookUrl:  initialPortal.facebook_url ?? "",
    youtubeUrl:   initialPortal.youtube_url ?? "",
    twitterUrl:   initialPortal.twitter_url ?? "",
    tiktokUrl:    initialPortal.tiktok_url ?? "",
    linkedinUrl:  initialPortal.linkedin_url ?? "",
    ctaLabel: initialPortal.cta_label,
    brokerCtaLabel: initialPortal.broker_cta_label,
    isPublished: initialPortal.is_published,
    academyDescription: initialPortal.academy_description ?? "",
    contactEmail: initialPortal.contact_email ?? "",
    riskDisclosureTemplateId: initialPortal.risk_disclosure_template_id,
    riskDisclosureEnabled: initialPortal.risk_disclosure_enabled,
  });

  const portalUrl = useMemo(
    () => `/portal/${values.slug || initialPortal.slug}`,
    [initialPortal.slug, values.slug],
  );

  function updateValue(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setState("idle");
    setMessage("");
  }

  function previewLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setState("idle");
    setMessage("");
  }

  async function save(formData: FormData) {
    setState("saving");
    setMessage("");
    formData.set("isPublished", values.isPublished ? "true" : "false");

    const response = await fetch("/api/portal/branding", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Your branding changes could not be saved.");
      return;
    }

    setLogoPath(payload.logoPath ?? logoPath);
    if (payload.logoPath) {
      setLogoPreview(getPortalBrandingUrl(payload.logoPath));
    }
    setState("saved");
    setMessage("Portal branding saved successfully.");
    router.refresh();
  }

  return (
    <div className={styles.layout}>
      <form action={save} className={styles.form}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Identity</span>
              <h2>Portal details</h2>
            </div>
            <label className={styles.publish}>
              <input
                checked={values.isPublished}
                name="isPublished"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    isPublished: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                <strong>Publish portal</strong>
                <small>Make this page visible publicly.</small>
              </span>
            </label>
          </div>

          <div className={styles.logoRow}>
            <div className={styles.logoPreview}>
              {logoPreview ? (
                <Image
                  alt=""
                  height={70}
                  src={logoPreview}
                  unoptimized
                  width={70}
                />
              ) : (
                values.portalName.slice(0, 1).toUpperCase()
              )}
            </div>
            <label className={styles.logoUpload}>
              <ImagePlus size={18} />
              <span>
                <strong>Upload logo</strong>
                <small>PNG, JPG, WebP, or SVG. Maximum 5 MB.</small>
              </span>
              <input
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                name="logo"
                onChange={previewLogo}
                type="file"
              />
            </label>
          </div>

          <div className={styles.twoColumns}>
            <label>
              Portal name
              <input
                maxLength={120}
                name="portalName"
                onChange={updateValue}
                required
                value={values.portalName}
              />
            </label>
            <label>
              Academy address
              <span className={styles.slugField}>
                <small>/portal/</small>
                <input
                  aria-readonly="true"
                  readOnly
                  value={values.slug}
                />
              </span>
            </label>
          </div>

          <div className={styles.twoColumns}>
            <label>
              Primary color
              <span className={styles.colorField}>
                <input
                  aria-label="Choose primary color"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      primaryColor: event.target.value,
                    }))
                  }
                  type="color"
                  value={values.primaryColor}
                />
                <input
                  maxLength={7}
                  name="primaryColor"
                  onChange={updateValue}
                  pattern="#[0-9A-Fa-f]{6}"
                  required
                  value={values.primaryColor}
                />
              </span>
            </label>
            <label>
              Accent color
              <span className={styles.colorField}>
                <input
                  aria-label="Choose accent color"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      accentColor: event.target.value,
                    }))
                  }
                  type="color"
                  value={values.accentColor}
                />
                <input
                  maxLength={7}
                  name="accentColor"
                  onChange={updateValue}
                  pattern="#[0-9A-Fa-f]{6}"
                  required
                  value={values.accentColor}
                />
              </span>
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Content</span>
              <h2>Hero and welcome message</h2>
            </div>
          </div>
          <label>
            Academy description
            <textarea maxLength={800} name="academyDescription" onChange={updateValue} rows={4} value={values.academyDescription} />
          </label>
          <label>
            Hero title
            <input
              maxLength={180}
              name="heroTitle"
              onChange={updateValue}
              required
              value={values.heroTitle}
            />
          </label>
          <label>
            Hero subtitle
            <textarea
              maxLength={320}
              name="heroSubtitle"
              onChange={updateValue}
              rows={3}
              value={values.heroSubtitle}
            />
          </label>
          <label>
            Welcome message
            <textarea
              maxLength={600}
              name="welcomeMessage"
              onChange={updateValue}
              required
              rows={5}
              value={values.welcomeMessage}
            />
          </label>
          <div className={styles.twoColumns}>
            <label>
              CTA button text
              <input
                maxLength={80}
                name="ctaLabel"
                onChange={updateValue}
                required
                value={values.ctaLabel}
              />
            </label>
            <label>
              Broker signup button text
              <input
                maxLength={80}
                name="brokerCtaLabel"
                onChange={updateValue}
                required
                value={values.brokerCtaLabel}
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Community</span>
              <h2>Social links</h2>
            </div>
          </div>
          <label>
            Contact email
            <input maxLength={320} name="contactEmail" onChange={updateValue} type="email" value={values.contactEmail} />
          </label>
          <label>
            WhatsApp number
            <input
              maxLength={32}
              name="whatsappNumber"
              onChange={updateValue}
              placeholder="+27 82 000 0000"
              value={values.whatsappNumber}
            />
          </label>
          <div className={styles.twoColumns}>
            <label>
              Telegram link
              <input
                maxLength={500}
                name="telegramUrl"
                onChange={updateValue}
                placeholder="https://t.me/youracademy"
                type="url"
                value={values.telegramUrl}
              />
            </label>
            <label>
              Instagram link
              <input
                maxLength={500}
                name="instagramUrl"
                onChange={updateValue}
                placeholder="https://instagram.com/youracademy"
                type="url"
                value={values.instagramUrl}
              />
            </label>
          </div>
          <label>
            Phone number
            <input
              maxLength={32}
              name="contactPhone"
              onChange={updateValue}
              placeholder="+44 7911 123456"
              type="tel"
              value={values.contactPhone}
            />
          </label>
          <div className={styles.twoColumns}>
            <label>
              Facebook URL
              <input
                maxLength={500}
                name="facebookUrl"
                onChange={updateValue}
                placeholder="https://facebook.com/youracademy"
                type="url"
                value={values.facebookUrl}
              />
            </label>
            <label>
              YouTube URL
              <input
                maxLength={500}
                name="youtubeUrl"
                onChange={updateValue}
                placeholder="https://youtube.com/@youracademy"
                type="url"
                value={values.youtubeUrl}
              />
            </label>
          </div>
          <div className={styles.twoColumns}>
            <label>
              X / Twitter URL
              <input
                maxLength={500}
                name="twitterUrl"
                onChange={updateValue}
                placeholder="https://x.com/youracademy"
                type="url"
                value={values.twitterUrl}
              />
            </label>
            <label>
              TikTok URL
              <input
                maxLength={500}
                name="tiktokUrl"
                onChange={updateValue}
                placeholder="https://tiktok.com/@youracademy"
                type="url"
                value={values.tiktokUrl}
              />
            </label>
          </div>
          <label>
            LinkedIn URL
            <input
              maxLength={500}
              name="linkedinUrl"
              onChange={updateValue}
              placeholder="https://linkedin.com/company/youracademy"
              type="url"
              value={values.linkedinUrl}
            />
          </label>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}><div><span>Compliance</span><h2>Approved trading-risk message</h2></div></div>
          <label>
            <input checked={values.riskDisclosureEnabled} name="riskDisclosureEnabled" onChange={(event) => setValues((current) => ({ ...current, riskDisclosureEnabled: event.target.checked }))} type="checkbox" />
            Show risk disclosure
          </label>
          <label>
            Approved message
            <select name="riskDisclosureTemplateId" onChange={(event) => setValues((current) => ({ ...current, riskDisclosureTemplateId: event.target.value }))} value={values.riskDisclosureTemplateId}>
              {riskTemplates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select>
          </label>
          <p>{riskTemplates.find((template) => template.id === values.riskDisclosureTemplateId)?.message}</p>
        </section>

        {message ? (
          <p className={state === "error" ? styles.error : styles.success}>
            {state === "saved" ? <CheckCircle2 size={17} /> : null}
            {message}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button disabled={state === "saving"} type="submit">
            {state === "saving" ? (
              <Loader2 className={styles.spin} size={18} />
            ) : null}
            Save branding
          </button>
          {values.isPublished ? (
            <a href={portalUrl} rel="noreferrer" target="_blank">
              View public portal <ExternalLink size={16} />
            </a>
          ) : (
            <span>Publish the portal to enable its public link.</span>
          )}
        </div>
      </form>

      <aside className={styles.previewColumn}>
        <div className={styles.previewLabel}>
          <span>Live preview</span>
          <small>Desktop</small>
        </div>
        <div className={styles.preview}>
          <header>
            <div>
              <span style={{ background: values.primaryColor }}>
                {logoPreview ? (
                  <Image
                    alt=""
                    height={28}
                    src={logoPreview}
                    unoptimized
                    width={28}
                  />
                ) : (
                  values.portalName[0]
                )}
              </span>
              <strong>{values.portalName || "Your portal"}</strong>
            </div>
          </header>
          <div className={styles.previewHero}>
            <small style={{ background: values.accentColor }}>
              Verified student community
            </small>
            <h3>{values.heroTitle || "Your hero title"}</h3>
            <p>{values.heroSubtitle || "Your hero subtitle will appear here."}</p>
            <div>
              <span style={{ background: values.primaryColor }}>
                {values.ctaLabel || "Join academy"}
              </span>
              <span>{values.brokerCtaLabel || "Open broker account"}</span>
            </div>
          </div>
          <div className={styles.previewWelcome}>
            <span>Welcome</span>
            <p>{values.welcomeMessage}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
