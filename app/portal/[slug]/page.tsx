import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Instagram,
  LockKeyhole,
  MessageCircle,
  Radio,
  Send,
  ShieldCheck,
} from "lucide-react";
import { CustomSiteRenderer } from "@/components/custom-site-renderer";
import { StudentRegistrationForm } from "@/components/student-registration-form";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import type { PublicBrokerOption } from "@/lib/database.types";
import { loadCustomSiteBySlug } from "@/lib/custom-sites";
import { getPortalBrandingUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { loadWebsiteBySlug } from "@/lib/website-builder";
import styles from "./portal.module.css";

interface PortalPageProps {
  params: Promise<{ slug: string }>;
}

async function loadPortal(slug: string) {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: portal } = await supabase
    .from("portals")
    .select(
      "id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,whatsapp_number,telegram_url,instagram_url,primary_color,accent_color,logo_path,cta_label,broker_cta_label,is_published",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!portal) return null;

  const { data: options } = await supabase.rpc(
    "get_public_portal_broker_options",
    { target_portal_slug: slug },
  );
  const brokers = ((options ?? []) as PublicBrokerOption[]).map((option) => ({
    id: option.broker_id,
    name: option.broker_name,
    slug: option.broker_slug,
    logo_path: option.broker_logo_path,
    connectionId: option.connection_id,
    affiliateLink: option.affiliate_link,
    verificationMethod: option.verification_method,
  }));

  return { portal, brokers };
}

export async function generateMetadata({
  params,
}: PortalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const customSite = await loadCustomSiteBySlug(slug);
  if (customSite) {
    return {
      title: customSite.title,
      description: customSite.description ?? customSite.portal.hero_subtitle,
    };
  }
  const website = await loadWebsiteBySlug(slug);
  if (website) {
    const home = website.pages.find((page) => page.is_home);
    return {
      title: home?.seo_title ?? website.portal.portal_name,
      description: home?.seo_description ?? website.portal.hero_subtitle,
    };
  }
  const result = await loadPortal(slug);
  return { title: result?.portal.portal_name ?? "Mentor portal" };
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { slug } = await params;
  const customSite = await loadCustomSiteBySlug(slug);
  if (customSite) {
    return <CustomSiteRenderer site={customSite} />;
  }

  const website = await loadWebsiteBySlug(slug);
  if (website) {
    const homeSlug =
      website.pages.find((page) => page.is_home)?.slug ?? "home";
    return <WebsiteRenderer currentPageSlug={homeSlug} data={website} />;
  }

  const result = await loadPortal(slug);
  if (!result) notFound();

  const { portal, brokers } = result;
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
        <div className={styles.portalBrand}>
          <span
            className={logoUrl ? styles.logoImage : ""}
            style={{ background: portal.primary_color }}
          >
            {logoUrl ? (
              <Image
                alt={`${portal.portal_name} logo`}
                height={36}
                src={logoUrl}
                unoptimized
                width={36}
              />
            ) : (
              portal.portal_name.slice(0, 1).toUpperCase()
            )}
          </span>
          {portal.portal_name}
        </div>
        <div className={styles.navActions}>
          <a href="#welcome">About</a>
          <a href="#register">Student sign up</a>
        </div>
      </nav>

      <section className={`container ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <div className={styles.verified}>
            <ShieldCheck size={16} /> Verified student community
          </div>
          <h1>{portal.hero_title}</h1>
          <p>
            {portal.hero_subtitle ??
              "Join a focused learning environment with private trading education, resources, and live market sessions."}
          </p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryCta}
              href="#register"
              style={{ background: portal.primary_color }}
            >
              {portal.cta_label} <ArrowRight size={17} />
            </a>
            <a
              className={styles.brokerCta}
              href="#register"
              style={{ background: portal.accent_color }}
            >
              {portal.broker_cta_label}
            </a>
          </div>
        </div>
        <div className={styles.accessCard}>
          <div className={styles.lock}>
            <LockKeyhole size={27} />
          </div>
          <p className="eyebrow">Member access</p>
          <h2>Everything you need in one private portal.</h2>
          <ul>
            <li>
              <BookOpen size={18} /> Structured lessons and resources
            </li>
            <li>
              <Radio size={18} /> Live classes and market sessions
            </li>
            <li>
              <ShieldCheck size={18} /> Broker-verified membership
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.welcomeSection} id="welcome">
        <div className={`container ${styles.welcomeGrid}`}>
          <div className={styles.welcomeCard}>
            <p className="eyebrow">Welcome to the academy</p>
            <h2>A focused place to learn, connect, and improve.</h2>
          </div>
          <div className={styles.welcomeCopy}>
            <p>{portal.welcome_message}</p>
            {whatsappUrl || portal.telegram_url || portal.instagram_url ? (
              <div className={styles.socialLinks}>
                {whatsappUrl ? (
                  <a href={whatsappUrl} rel="noreferrer" target="_blank">
                    <MessageCircle size={17} /> WhatsApp
                  </a>
                ) : null}
                {portal.telegram_url ? (
                  <a href={portal.telegram_url} rel="noreferrer" target="_blank">
                    <Send size={17} /> Telegram
                  </a>
                ) : null}
                {portal.instagram_url ? (
                  <a href={portal.instagram_url} rel="noreferrer" target="_blank">
                    <Instagram size={17} /> Instagram
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.registrationSection} id="register">
        <div className={`container ${styles.registrationGrid}`}>
          <div>
            <p className="eyebrow">Student application</p>
            <h2>Verify once. Learn privately.</h2>
            <p>
              Create your student account and provide your broker account ID.
              Verification is performed securely on the server. Broker
              credentials are never exposed to this page.
            </p>
            <div
              className={styles.registrationAccent}
              style={{ background: portal.accent_color }}
            >
              <strong>{portal.broker_cta_label}</strong>
              <span>
                Select an available broker in the application form to continue.
              </span>
            </div>
            <div className={styles.steps}>
              <span>1</span>
              <div>
                <strong>Create your account</strong>
                <p>Use an email address you can access.</p>
              </div>
              <span>2</span>
              <div>
                <strong>Submit broker details</strong>
                <p>Your account is checked against the mentor&apos;s partner record.</p>
              </div>
              <span>3</span>
              <div>
                <strong>Access private content</strong>
                <p>Verified students unlock the academy portal.</p>
              </div>
            </div>
          </div>
          <div className={styles.formCard}>
            <h3>Apply for access</h3>
            <p>All fields are required.</p>
            <StudentRegistrationForm
              brokers={brokers}
              portalId={portal.id}
              portalSlug={portal.slug}
              primaryColor={portal.primary_color}
              traderId={portal.trader_id}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
