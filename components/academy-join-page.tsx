import Image from "next/image";
import Link from "next/link";
import { StudentRegistrationForm } from "@/components/student-registration-form";
import type { AcademyEntryContext } from "@/lib/academy-entry";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "./academy-entry.module.css";

export function AcademyJoinPage({
  customDomain = false,
  data,
}: {
  customDomain?: boolean;
  data: AcademyEntryContext;
}) {
  const logo = getPortalBrandingUrl(data.portal.logo_path);
  const routeContext = { portalSlug: data.portal.slug, customDomain };
  const homeHref = getAcademyEntryHref(routeContext, "home");
  const loginHref = getAcademyEntryHref(routeContext, "login");
  const studentPortalPath = getAcademyEntryHref(routeContext, "academy");
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
            <Link className={styles.primaryNav} href={loginHref}>
              Sign In
            </Link>
          </div>
        </nav>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.eyebrow}>
              {isSubscription ? "Enrolment" : "Student application"}
            </p>
            <h2>{data.portal.portal_name}</h2>
            <p>
              {isSubscription
                ? "Create your account below. Returning students should use Sign In."
                : "Use the form below to request private academy access. Returning students should use Sign In."}
            </p>
          </div>
          <StudentRegistrationForm
            accessModel={data.portal.access_model}
            academyName={data.portal.portal_name}
            loginPath={loginHref}
            portalSlug={data.portal.slug}
            primaryColor={data.portal.primary_color}
            studentDestination={studentPortalPath}
          />
          {!isSubscription && (
            <div className={styles.partnerBadge}>
              <Image
                alt="XM Global"
                height={18}
                src="/images/xm-global-logo.svg"
                unoptimized
                width={60}
              />
              <span>Partnered with XM Global</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
