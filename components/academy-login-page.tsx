import Image from "next/image";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import type { AcademyEntryContext } from "@/lib/academy-entry";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import styles from "./academy-entry.module.css";

export function AcademyLoginPage({
  customDomain = false,
  data,
}: {
  customDomain?: boolean;
  data: AcademyEntryContext;
}) {
  const logo = getPortalBrandingUrl(data.portal.logo_path);
  const routeContext = { portalSlug: data.portal.slug, customDomain };
  const homeHref = getAcademyEntryHref(routeContext, "home");
  const joinHref = getAcademyEntryHref(routeContext, "join-academy");
  const studentDestination = getAcademyEntryHref(routeContext, "academy");
  const platformOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const setupHref = customDomain && platformOrigin ? new URL("/account-setup", platformOrigin).toString() : "/account-setup";
  const recoveryHref = customDomain && platformOrigin ? new URL("/recover", platformOrigin).toString() : "/recover";
  // For custom domain logins, route through /api/workspace/goto on the platform domain.
  // This ensures km_workspace is set on kaimentors.vercel.app (where the dashboard runs),
  // not on the custom domain where the Set-Cookie would be unreachable by the dashboard.
  const mentorDashboardHref =
    customDomain && platformOrigin
      ? new URL(
          `/api/workspace/goto?traderId=${data.portal.trader_id}&next=/dashboard`,
          platformOrigin,
        ).toString()
      : "/dashboard";
  const theme = {
    "--academy-primary": data.portal.primary_color,
    "--academy-accent": data.portal.accent_color,
  } as React.CSSProperties;

  return (
    <main className={styles.page} style={theme}>
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
              Join Academy
            </Link>
          </div>
        </nav>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <LockKeyhole size={28} />
              <p className={styles.eyebrow}>Academy login</p>
              <h2>Welcome back</h2>
              <p>
                Sign in to {data.portal.portal_name}. Students and mentors of this academy can sign in here.
              </p>
            </div>
            <LoginForm
              academyContext={{
                traderId: data.portal.trader_id,
                studentDestination,
                mentorDestination: mentorDashboardHref,
              }}
              submitLabel="Sign In"
            />
            <p className={styles.footerNote}><Link href={setupHref}>Resume account setup</Link> · <Link href={recoveryHref}>Forgot password</Link></p>
            <p className={styles.footerNote}>
              Secure academy access powered by KaiMentors.
            </p>
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
          </section>
      </section>
    </main>
  );
}
