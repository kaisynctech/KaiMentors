import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import type { AcademyEntryContext } from "@/lib/academy-entry";
import {
  getAcademyEntryHref,
  honourStudentNext,
  isSafeInternalPath,
} from "@/lib/academy-routes";
import { getPortalBrandingUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import styles from "./academy-entry.module.css";

export async function AcademyLoginPage({
  customDomain = false,
  data,
  next,
}: {
  customDomain?: boolean;
  data: AcademyEntryContext;
  next?: string | null;
}) {
  const logo = getPortalBrandingUrl(data.portal.logo_path);
  const routeContext = { portalSlug: data.portal.slug, customDomain };
  const homeHref = getAcademyEntryHref(routeContext, "home");
  const joinHref = getAcademyEntryHref(routeContext, "join-academy");
  const studentDestination = getAcademyEntryHref(routeContext, "academy");
  const safeNext = isSafeInternalPath(next) ? next : undefined;
  const supabase = await createClient();
  if (supabase) {
    const { data: session } = await supabase.auth.getUser();
    if (session.user) {
      const { data: membership } = await supabase
        .from("trader_members")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("trader_id", data.portal.trader_id)
        .maybeSingle();
      if (membership) {
        redirect("/dashboard");
      }

      const { data: application } = await supabase
        .from("student_applications")
        .select("id")
        .eq("student_user_id", session.user.id)
        .eq("trader_id", data.portal.trader_id)
        .maybeSingle();
      if (application) {
        redirect(
          honourStudentNext(safeNext, data.portal.slug, customDomain) ??
            studentDestination,
        );
      }
    }
  }
  const platformOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const setupHref =
    customDomain && platformOrigin
      ? new URL("/account-setup", platformOrigin).toString()
      : "/account-setup";
  const recoveryHref =
    customDomain && platformOrigin
      ? new URL("/recover", platformOrigin).toString()
      : "/recover";
  // Mentor dashboard is served on the same domain as the login page (custom domain
  // or platform). Workspace is resolved server-side from the hostname (custom domain)
  // or km_workspace cookie (platform) — no cross-domain goto chain needed.
  const mentorDashboardHref = "/dashboard";
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
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <LockKeyhole size={28} />
            <p className={styles.eyebrow}>
              {isSubscription ? "Student login" : "Academy login"}
            </p>
            <h2>Welcome back</h2>
            <p>
              {isSubscription
                ? `Sign in to ${data.portal.portal_name}. Use the email and password you registered with.`
                : `Sign in to ${data.portal.portal_name}. Students and mentors of this academy can sign in here.`}
            </p>
          </div>
          <LoginForm
            academyContext={{
              traderId: data.portal.trader_id,
              portalSlug: data.portal.slug,
              studentDestination,
              mentorDestination: mentorDashboardHref,
              customDomain,
            }}
            next={safeNext}
            submitLabel="Sign In"
          />
          <p className={styles.footerNote}>
            <Link href={setupHref}>Resume account setup</Link> ·{" "}
            <Link href={recoveryHref}>Forgot password</Link>
          </p>
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
