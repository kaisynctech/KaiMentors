import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  Instagram,
  MessageCircle,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { StudentRegistrationForm } from "@/components/student-registration-form";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import {
  getWebsiteMediaUrl,
  type WebsiteData,
  type WebsiteSection,
} from "@/lib/website-types";
import styles from "./website-renderer.module.css";

interface WebsiteRendererProps {
  data: WebsiteData;
  currentPageSlug?: string;
  preview?: boolean;
  customDomain?: boolean;
}

function text(content: Record<string, unknown>, key: string, fallback = "") {
  const value = content[key];
  return typeof value === "string" ? value : fallback;
}

function items(content: Record<string, unknown>) {
  return Array.isArray(content.items)
    ? content.items.filter((item): item is string => typeof item === "string")
    : [];
}

function pageHref(
  portalSlug: string,
  pageSlug: string,
  isHome: boolean,
  preview: boolean,
  customDomain: boolean,
) {
  if (preview) return `/dashboard/website-builder/preview?page=${pageSlug}`;
  if (customDomain) return isHome ? "/" : `/${pageSlug}`;
  return isHome
    ? `/portal/${portalSlug}`
    : `/portal/${portalSlug}/${pageSlug}`;
}

function entryHref(
  portalSlug: string,
  entry: "join-academy" | "login",
  preview: boolean,
  customDomain: boolean,
) {
  if (preview) return `/dashboard/website-builder/preview`;
  return getAcademyEntryHref(
    { portalSlug, customDomain },
    entry,
  );
}

function SectionHeading({
  content,
}: {
  content: Record<string, unknown>;
}) {
  return (
    <div className={styles.sectionHeading}>
      {text(content, "eyebrow") ? <span>{text(content, "eyebrow")}</span> : null}
      <h2>{text(content, "title")}</h2>
      {text(content, "body") ? <p>{text(content, "body")}</p> : null}
    </div>
  );
}

function WebsiteSectionView({
  section,
  data,
  preview,
  customDomain,
}: {
  section: WebsiteSection;
  data: WebsiteData;
  preview: boolean;
  customDomain: boolean;
}) {
  const content = section.content;
  const joinHref = pageHref(
    data.portal.slug,
    "join-academy",
    false,
    preview,
    customDomain,
  );
  const signInHref = entryHref(data.portal.slug, "login", preview, customDomain);
  switch (section.section_type) {
    case "hero": {
      const heroImage = getWebsiteMediaUrl(data.theme.hero_image_path);
      return (
        <section className={`${styles.section} ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <ShieldCheck size={15} />
              {text(content, "eyebrow", "Private trading academy")}
            </span>
            <h1>{text(content, "title", data.portal.hero_title)}</h1>
            <p>{text(content, "body", data.portal.hero_subtitle ?? "")}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href={joinHref}>
                {text(content, "primaryCta", data.portal.cta_label)}
                <ArrowRight size={17} />
              </Link>
              <Link className={styles.secondaryAction} href={signInHref}>
                {text(content, "secondaryCta", "Sign In")}
              </Link>
            </div>
          </div>
          <div className={styles.heroVisual}>
            {heroImage ? (
              <Image
                alt={text(content, "imageAlt", `${data.portal.portal_name} academy`)}
                fill
                priority
                sizes="(max-width: 900px) 100vw, 44vw"
                src={heroImage}
                unoptimized
              />
            ) : (
              <>
                <span>Academy experience</span>
                <strong>Learn with structure.</strong>
                <div>
                  <BookOpen size={22} />
                  <p>Video courses, live education, and verified access.</p>
                </div>
              </>
            )}
          </div>
        </section>
      );
    }
    case "about":
      return (
        <section className={`${styles.section} ${styles.about}`}>
          <SectionHeading content={content} />
          <div className={styles.aboutPanel}>
            <span>{data.portal.portal_name}</span>
            <p>
              {text(
                content,
                "body",
                "Share your academy story and the standards behind your mentorship.",
              )}
            </p>
          </div>
        </section>
      );
    case "features":
      return (
        <section className={`${styles.section} ${styles.surfaceSection}`}>
          <SectionHeading content={content} />
          <div className={styles.featureGrid}>
            {items(content).map((item, index) => (
              <article key={`${item}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{item}</h3>
                <Check size={18} />
              </article>
            ))}
          </div>
        </section>
      );
    case "courses":
      return (
        <section className={`${styles.section} ${styles.courses}`}>
          <SectionHeading content={content} />
          <div className={styles.courseGrid}>
            {data.courses.length ? (
              data.courses.map((course) => (
                <article key={course.id}>
                  <div className={styles.courseCover}>
                    {course.coverUrl ? (
                      <Image
                        alt=""
                        fill
                        sizes="(max-width: 700px) 100vw, 33vw"
                        src={course.coverUrl}
                        unoptimized
                      />
                    ) : (
                      <BookOpen size={25} />
                    )}
                  </div>
                  <span>Video course</span>
                  <h3>{course.title}</h3>
                  <p>{course.description ?? "A structured academy course."}</p>
                </article>
              ))
            ) : (
              <div className={styles.emptyState}>
                <BookOpen size={24} />
                <h3>Courses are being prepared.</h3>
                <p>Published academy courses will appear here.</p>
              </div>
            )}
          </div>
        </section>
      );
    case "testimonials":
      return (
        <section className={`${styles.section} ${styles.surfaceSection}`}>
          <SectionHeading content={content} />
          <div className={styles.testimonialGrid}>
            {items(content).map((item, index) => (
              <blockquote key={`${item}-${index}`}>
                <p>&quot;{item}&quot;</p>
                <footer>Academy student</footer>
              </blockquote>
            ))}
          </div>
        </section>
      );
    case "community":
      return (
        <section className={`${styles.section} ${styles.community}`}>
          <div className={styles.communityIcon}>
            <Users size={30} />
          </div>
          <SectionHeading content={content} />
          <SocialLinks data={data} />
        </section>
      );
    case "cta":
      return (
        <section className={`${styles.section} ${styles.cta}`}>
          <SectionHeading content={content} />
          <Link href={joinHref}>
            {text(content, "buttonText", "Join Academy")}
            <ArrowRight size={17} />
          </Link>
        </section>
      );
    case "faq":
      return (
        <section className={`${styles.section} ${styles.faq}`}>
          <SectionHeading content={content} />
          <div>
            {items(content).map((item, index) => {
              const [question, answer] = item.split("|");
              return (
                <details key={`${question}-${index}`} open={index === 0}>
                  <summary>{question}</summary>
                  <p>{answer ?? "Add an answer in the Website Builder."}</p>
                </details>
              );
            })}
          </div>
        </section>
      );
    case "contact":
      return (
        <section className={`${styles.section} ${styles.contact}`}>
          <SectionHeading content={content} />
          <div>
            <SocialLinks data={data} />
          </div>
        </section>
      );
    case "join_academy":
      return (
        <section className={`${styles.section} ${styles.join}`}>
          <div>
            <SectionHeading content={content} />
            <div className={styles.joinSteps}>
              <span>1</span><p>Create your student account.</p>
              <span>2</span><p>Submit your broker details.</p>
              <span>3</span><p>Unlock verified academy access.</p>
            </div>
          </div>
          <div className={styles.formCard}>
            {preview ? (
              <div className={styles.previewNotice}>
                <ShieldCheck size={24} />
                <h3>Registration form preview</h3>
                <p>The live student application appears here after publishing.</p>
              </div>
            ) : (
              <StudentRegistrationForm
                loginPath={signInHref}
                portalSlug={data.portal.slug}
                primaryColor={data.theme.primary_color}
              />
            )}
          </div>
        </section>
      );
  }
}

function SocialLinks({ data }: { data: WebsiteData }) {
  const links = data.theme.social_links ?? {};
  const whatsapp = links.whatsapp
    ? `https://wa.me/${links.whatsapp.replace(/\D/g, "")}`
    : null;
  return (
    <div className={styles.socialLinks}>
      {whatsapp ? (
        <a href={whatsapp} rel="noreferrer" target="_blank">
          <MessageCircle size={17} /> WhatsApp
        </a>
      ) : null}
      {links.telegram ? (
        <a href={links.telegram} rel="noreferrer" target="_blank">
          <Send size={17} /> Telegram
        </a>
      ) : null}
      {links.instagram ? (
        <a href={links.instagram} rel="noreferrer" target="_blank">
          <Instagram size={17} /> Instagram
        </a>
      ) : null}
    </div>
  );
}

export function WebsiteRenderer({
  data,
  currentPageSlug = "home",
  preview = false,
  customDomain = false,
}: WebsiteRendererProps) {
  const logo = data.theme.logo_path
    ? getWebsiteMediaUrl(data.theme.logo_path)
    : getPortalBrandingUrl(data.portal.logo_path);
  const currentPage =
    data.pages.find((page) => page.slug === currentPageSlug) ??
    data.pages.find((page) => page.is_home);
  const headerNavigation = data.navigation.filter(
    (item) => item.location === "header" && item.is_enabled,
  );
  const theme = {
    "--site-primary": data.theme.primary_color,
    "--site-accent": data.theme.accent_color,
    "--site-background": data.theme.background_color,
    "--site-surface": data.theme.surface_color,
    "--site-text": data.theme.text_color,
    "--site-heading-font": data.theme.heading_font,
    "--site-body-font": data.theme.body_font,
  } as React.CSSProperties;

  return (
    <main
      className={`${styles.website} ${styles[data.template.template_key] ?? ""}`}
      style={theme}
    >
      {preview ? (
        <div className={styles.previewBar}>
          Draft preview
          <Link href="/dashboard/website-builder">Back to Website Builder</Link>
        </div>
      ) : null}
      <header className={styles.header}>
        <Link
          className={styles.brand}
          href={pageHref(
            data.portal.slug,
            "home",
            true,
            preview,
            customDomain,
          )}
        >
          <span>
            {logo ? (
              <Image
                alt={`${data.portal.portal_name} logo`}
                height={42}
                src={logo}
                unoptimized
                width={42}
              />
            ) : (
              data.portal.portal_name.slice(0, 1)
            )}
          </span>
          <strong>{data.portal.portal_name}</strong>
        </Link>
        <nav>
          {headerNavigation.map((item) => {
            const page = data.pages.find((entry) => entry.id === item.page_id);
            const href = page
              ? pageHref(
                  data.portal.slug,
                  page.slug,
                  page.is_home,
                  preview,
                  customDomain,
                )
              : item.href ?? "#";
            return (
              <Link
                href={href}
                key={item.id}
                target={item.open_in_new_tab ? "_blank" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          className={styles.studentLogin}
          href={entryHref(data.portal.slug, "login", preview, customDomain)}
        >
          Sign In
        </Link>
        <Link className={styles.headerCta} href={entryHref(data.portal.slug, "join-academy", preview, customDomain)}>
          Join Academy
        </Link>
      </header>

      <div className={styles.pageIntro}>
        {!currentPage?.is_home ? <span>{currentPage?.title}</span> : null}
      </div>
      {data.sections.map((section) => (
        <WebsiteSectionView
          data={data}
          key={section.id}
          preview={preview}
          customDomain={customDomain}
          section={section}
        />
      ))}

      <footer className={styles.footer}>
        <div>
          <strong>{data.portal.portal_name}</strong>
          <p>Professional trading education and verified community access.</p>
        </div>
        <SocialLinks data={data} />
        <small>Powered by KaiMentors</small>
      </footer>
    </main>
  );
}
