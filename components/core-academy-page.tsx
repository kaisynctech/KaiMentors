import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Facebook, Instagram, Linkedin, Mail, MessageCircle, Phone, Send, Twitter, Youtube } from "lucide-react";
import type { AcademyEntryPortal } from "@/lib/academy-entry";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "@/app/portal/[slug]/portal.module.css";

function TikTokIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
    </svg>
  );
}

export function CoreAcademyPage({
  customDomain = false,
  portal,
}: {
  customDomain?: boolean;
  portal: AcademyEntryPortal;
}) {
  const routes = { portalSlug: portal.slug, customDomain };
  const joinHref = getAcademyEntryHref(routes, "join-academy");
  const loginHref = getAcademyEntryHref(routes, "login");
  const logoUrl = getPortalBrandingUrl(portal.logo_path);
  const whatsappUrl = portal.whatsapp_number
    ? `https://wa.me/${portal.whatsapp_number.replace(/\D/g, "")}`
    : null;
  const theme = {
    "--portal-primary": portal.primary_color,
    "--portal-accent": portal.accent_color,
  } as React.CSSProperties;

  return (
    <main className={styles.page} style={theme}>
      <nav className={`container ${styles.nav}`}>
        <Link className={styles.portalBrand} href={getAcademyEntryHref(routes, "home")}>
          <span className={logoUrl ? styles.logoImage : ""} style={{ background: portal.primary_color }}>
            {logoUrl ? <Image alt={`${portal.portal_name} logo`} height={36} src={logoUrl} unoptimized width={36} /> : portal.portal_name.slice(0, 1)}
          </span>
          {portal.portal_name}
        </Link>
        <div className={styles.navActions}>
          <a href="#about">About</a>
          <Link href={joinHref}>Join Academy</Link>
          <Link href={loginHref}>Sign In</Link>
        </div>
      </nav>

      <section className={`container ${styles.hero}`}>
        <div className={styles.heroCopy}>

          <h1>{portal.hero_title}</h1>
          <p>{portal.hero_subtitle ?? portal.academy_description ?? "Professional education, community, and private academy access."}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href={joinHref} style={{ background: portal.primary_color }}>
              Join Academy <ArrowRight size={17} />
            </Link>
            <Link className={styles.brokerCta} href={loginHref} style={{ background: portal.accent_color }}>Sign In</Link>
          </div>
        </div>
        <div className={styles.accessCard} id="about">
          <p className="eyebrow">About the academy</p>
          <h2>{portal.portal_name}</h2>
          <p>{portal.academy_description ?? portal.welcome_message}</p>
        </div>
      </section>

      <section className={styles.welcomeSection}>
        <div className={`container ${styles.welcomeGrid}`}>
          <div className={styles.welcomeCard}>
            <p className="eyebrow">Welcome</p>
            <h2>Learn, connect, and progress in one private academy.</h2>
          </div>
          <div className={styles.welcomeCopy}>
            <p>{portal.welcome_message}</p>
            <div className={styles.socialLinks}>
              {portal.contact_email   ? <a href={`mailto:${portal.contact_email}`}><Mail size={17} /> Email</a> : null}
              {portal.contact_phone   ? <a href={`tel:${portal.contact_phone}`}><Phone size={17} /> Call</a> : null}
              {whatsappUrl            ? <a href={whatsappUrl} rel="noreferrer" target="_blank"><MessageCircle size={17} /> WhatsApp</a> : null}
              {portal.telegram_url    ? <a href={portal.telegram_url} rel="noreferrer" target="_blank"><Send size={17} /> Telegram</a> : null}
              {portal.instagram_url   ? <a href={portal.instagram_url} rel="noreferrer" target="_blank"><Instagram size={17} /> Instagram</a> : null}
              {portal.facebook_url    ? <a href={portal.facebook_url} rel="noreferrer" target="_blank"><Facebook size={17} /> Facebook</a> : null}
              {portal.youtube_url     ? <a href={portal.youtube_url} rel="noreferrer" target="_blank"><Youtube size={17} /> YouTube</a> : null}
              {portal.twitter_url     ? <a href={portal.twitter_url} rel="noreferrer" target="_blank"><Twitter size={17} /> X</a> : null}
              {portal.tiktok_url      ? <a href={portal.tiktok_url} rel="noreferrer" target="_blank"><TikTokIcon /> TikTok</a> : null}
              {portal.linkedin_url    ? <a href={portal.linkedin_url} rel="noreferrer" target="_blank"><Linkedin size={17} /> LinkedIn</a> : null}
            </div>
          </div>
        </div>
      </section>

      {portal.risk_disclosure_enabled && portal.risk_disclosure ? (
        <section className={styles.registrationSection}>
          <div className={`container ${styles.registrationAccent}`} style={{ background: portal.accent_color }}>
            <strong>{portal.risk_disclosure.title}</strong>
            <span>{portal.risk_disclosure.message}</span>
          </div>
        </section>
      ) : null}
    </main>
  );
}
