import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { StudentRegistrationForm } from "@/components/student-registration-form";
import type { CustomSiteJoinData } from "@/lib/custom-sites";
import styles from "./custom-site-join-page.module.css";

export function CustomSiteJoinPage({ data }: { data: CustomSiteJoinData }) {
  const theme = {
    "--custom-primary": data.portal.primary_color,
    "--custom-accent": data.portal.accent_color,
  } as React.CSSProperties;

  return (
    <main className={styles.page} style={theme}>
      <section className={styles.shell}>
        <Link className={styles.backLink} href="/">
          <ArrowLeft size={16} /> Back to website
        </Link>
        <div className={styles.grid}>
          <aside className={styles.intro}>
            <span className={styles.packageLabel}>{data.package.name}</span>
            <h1>Apply for student access.</h1>
            <p>
              Submit your details once. KaiMentors sends the application into
              the mentor workspace, creates a verification record, and keeps the
              student experience under this academy brand.
            </p>
            <div className={styles.assurance}>
              <ShieldCheck size={18} />
              <div>
                <strong>Broker-verified membership</strong>
                <span>Applications are reviewed before course access opens.</span>
              </div>
            </div>
            <div className={styles.assurance}>
              <LockKeyhole size={18} />
              <div>
                <strong>Powered by KaiMentors</strong>
                <span>Authentication, courses, groups, and messages stay protected.</span>
              </div>
            </div>
          </aside>

          <section className={styles.formCard}>
            <p className={styles.eyebrow}>Academy onboarding</p>
            <h2>{data.portal.portal_name}</h2>
            <p>
              Use the form below to request access to the student portal.
            </p>
            <StudentRegistrationForm
              brokers={data.brokers}
              portalId={data.portal.id}
              portalSlug={data.portal.slug}
              primaryColor={data.portal.primary_color}
              traderId={data.portal.trader_id}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
