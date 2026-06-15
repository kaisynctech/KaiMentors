import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  SearchCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { createClient } from "@/lib/supabase/server";
import { getStudentBasePath } from "@/lib/student-routing";
import styles from "./student.module.css";

export default async function StudentPage() {
  const studentBasePath = await getStudentBasePath();
  const supabase = await createClient();
  const { data: userData } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  const { data: application } =
    supabase && userData.user
      ? await supabase
          .from("student_applications")
          .select("status,status_reason,submitted_at,portal:portals(portal_name,slug)")
          .eq("student_user_id", userData.user.id)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  const verified = application?.status === "verified";
  const rejected = application?.status === "rejected";
  const needsMoreInformation =
    application?.status === "needs_more_information";
  const portal = Array.isArray(application?.portal)
    ? application.portal[0]
    : application?.portal;
  const brandLabel =
    studentBasePath === "/academy"
      ? portal?.portal_name ?? "Academy"
      : "KaiMentors";

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={studentBasePath} label={brandLabel} />
        <Link href="/auth/signout">Sign out</Link>
      </nav>
      <section className={styles.card}>
        <div className={verified ? styles.successIcon : styles.pendingIcon}>
          {verified ? (
            <CheckCircle2 size={30} />
          ) : rejected || needsMoreInformation ? (
            <AlertCircle size={30} />
          ) : (
            <Clock3 size={30} />
          )}
        </div>
        <p className="eyebrow">Student access</p>
        <h1>
          {verified
            ? "Your access is verified"
            : rejected
              ? "Your application was not approved"
              : needsMoreInformation
                ? "More information is required"
                : "Verification in progress"}
        </h1>
        <p className={styles.lead}>
          {verified
            ? `You can now enter ${portal?.portal_name ?? "your mentor portal"}.`
            : rejected
              ? application?.status_reason ??
                "Your mentor could not verify the submitted broker details."
              : needsMoreInformation
                ? application?.status_reason ??
                  "Your mentor needs additional details before completing verification."
                : "Your broker details are being checked. Access remains locked until verification is complete."}
        </p>
        <div className={styles.timeline}>
          <div className={styles.complete}>
            <CheckCircle2 size={18} />
            <span><strong>Application submitted</strong><small>Your student account is active.</small></span>
          </div>
          <div className={verified ? styles.complete : styles.current}>
            <SearchCheck size={18} />
            <span><strong>Broker verification</strong><small>Status: {application?.status?.replace(/_/g, " ") ?? "pending"}</small></span>
          </div>
          <div className={verified ? styles.complete : ""}>
            <LockKeyhole size={18} />
            <span><strong>Private portal access</strong><small>{verified ? "Unlocked" : "Waiting for verification"}</small></span>
          </div>
        </div>
        {verified && portal?.slug ? (
          <>
            <Link className="button button-primary" href={`${studentBasePath}/courses`}>
              View video courses
            </Link>
            <Link className="button button-secondary" href={`${studentBasePath}/messages`}>
              Open academy messages
            </Link>
            <Link
              className="button button-secondary"
              href={`/portal/${portal.slug}`}
            >
              Enter mentor portal
            </Link>
          </>
        ) : null}
      </section>
    </main>
  );
}
