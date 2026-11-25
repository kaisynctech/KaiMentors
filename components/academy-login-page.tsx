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
import { createClient } from "@/lib/supabase/server";
import { AcademyAuthShell } from "@/components/academy-auth-shell";
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
  const routeContext = { portalSlug: data.portal.slug, customDomain };
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
  // Both pages exist on custom domains in the academy's branding, so keep
  // visitors on the academy's own domain.
  const setupHref = "/account-setup";
  const recoveryHref = "/recover";
  // Mentor dashboard is served on the same domain as the login page (custom domain
  // or platform). Workspace is resolved server-side from the hostname (custom domain)
  // or km_workspace cookie (platform) — no cross-domain goto chain needed.
  const mentorDashboardHref = "/dashboard";
  const isSubscription = data.portal.access_model === "subscription";

  return (
    <AcademyAuthShell customDomain={customDomain} data={data}>
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
    </AcademyAuthShell>
  );
}
