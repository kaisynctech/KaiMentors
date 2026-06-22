import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
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
            <Link href={homeHref}>Academy Website</Link>
            <Link className={styles.primaryNav} href={loginHref}>
              Sign In
            </Link>
          </div>
        </nav>
        <div className={styles.grid}>
          <aside className={styles.intro}>
            <span className={styles.eyebrow}>Join Academy</span>
            <h1>Apply for student access.</h1>
            <p>
              Create your student account, submit your broker details, and
              follow your academy access status from one secure student portal.
            </p>
            <div className={styles.assurance}>
              <ShieldCheck size={38} />
              <div>
                <strong>Your academy access is reviewed.</strong>
                <span>
                  Registration creates a tenant-specific application and
                  verification record for {data.portal.portal_name}.
                </span>
              </div>
            </div>
            <div className={styles.assurance}>
              <LockKeyhole size={38} />
              <div>
                <strong>Protected by KaiMentors.</strong>
                <span>
                  Courses, groups, messages, and permissions stay inside the
                  same secure academy operating system.
                </span>
              </div>
            </div>
          </aside>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.eyebrow}>Student application</p>
              <h2>{data.portal.portal_name}</h2>
              <p>
                Use the form below to request private academy access. Returning
                students should use Sign In.
              </p>
            </div>
            <StudentRegistrationForm
              brokers={data.brokers}
              portalSlug={data.portal.slug}
              primaryColor={data.portal.primary_color}
              studentPortalPath={studentPortalPath}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
