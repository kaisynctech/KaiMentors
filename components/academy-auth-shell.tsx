import Image from "next/image";
import Link from "next/link";
import type { AcademyEntryContext } from "@/lib/academy-entry";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "./academy-entry.module.css";

/**
 * Academy-branded frame for sign-in style pages (login, account setup,
 * password recovery): the academy's logo, name and colours, a Home link and
 * a Join/Enrol button, with the page content in the card.
 */
export function AcademyAuthShell({
  customDomain = false,
  data,
  children,
}: {
  customDomain?: boolean;
  data: AcademyEntryContext;
  children: React.ReactNode;
}) {
  const logo = getPortalBrandingUrl(data.portal.logo_path);
  const routeContext = { portalSlug: data.portal.slug, customDomain };
  const homeHref = getAcademyEntryHref(routeContext, "home");
  const joinHref = getAcademyEntryHref(routeContext, "join-academy");
  const isSubscription = data.portal.access_model === "subscription";
  const theme = {
    "--academy-primary": data.portal.primary_color,
    "--academy-accent": data.portal.accent_color,
  } as React.CSSProperties;

  return (
    <main
      className={`${styles.page}${isSubscription ? ` ${styles.pageDark}` : ""}`}
      style={theme}
    >
      <section className={styles.shell}>
        <nav className={styles.nav}>
          <Link className={styles.brand} href={homeHref}>
            <span>
              {logo ? (
                <Image
                  alt={`${data.portal.portal_name} logo`}
                  height={48}
                  src={logo}
                  unoptimized
                  width={48}
                />
              ) : (
                data.portal.portal_name.slice(0, 1)
              )}
            </span>
            <strong>{data.portal.portal_name}</strong>
          </Link>
          <div className={styles.navActions}>
            <Link href={homeHref}>← Home</Link>
            <Link className={styles.primaryNav} href={joinHref}>
              {isSubscription ? "Enrol" : "Join Academy"}
            </Link>
          </div>
        </nav>
        <section className={styles.card}>{children}</section>
      </section>
    </main>
  );
}
