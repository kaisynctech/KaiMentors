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
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./student.module.css";

interface StudentPageProps {
  searchParams?: Promise<{ portal?: string }>;
}

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const query = await searchParams;
  const academyContext = await getStudentAcademyContext(query?.portal);
  const studentBasePath = academyContext.basePath;
  const supabase = await createClient();
  const { data: userData } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  let applicationQuery =
    supabase && userData.user
      ? supabase
          .from("student_applications")
          .select("status,status_reason,submitted_at,portal_id,portal:portals!inner(portal_name,slug)")
          .eq("student_user_id", userData.user.id)
      : null;
  if (applicationQuery && academyContext.portalId) {
    applicationQuery = applicationQuery.eq("portal_id", academyContext.portalId);
  }
  if (applicationQuery && academyContext.portalSlug) {
    applicationQuery = applicationQuery.eq("portal.slug", academyContext.portalSlug);
  }
  const { data: application } = applicationQuery
    ? await applicationQuery
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
  const suffix = academyContext.querySuffix;
  const pendingReview =
    application?.status === "pending" || application?.status === "manual_review";
  const processing = application?.status === "processing";

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={`${studentBasePath}${suffix}`} label={brandLabel} />
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
            ? "You're approved. You can now access your academy."
            : rejected
              ? "Your application could not be approved."
              : needsMoreInformation
                ? "More information is needed before your access can be approved."
                : processing
                  ? "We're checking your verification details."
                  : pendingReview
                    ? "Your academy access is being reviewed."
                    : "Your academy access is being reviewed."}
        </h1>
        <p className={styles.lead}>
          {verified
            ? `You can now enter ${portal?.portal_name ?? "your mentor portal"}.`
            : rejected
              ? application?.status_reason ??
                "Your application could not be approved. Please contact the academy for support."
              : needsMoreInformation
                ? application?.status_reason ??
                  "More information is needed before your access can be approved."
                : processing
                  ? "We're checking your verification details."
                  : "Your academy access is being reviewed."}
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
            <Link className="button button-primary" href={`${studentBasePath}/courses${suffix}`}>
              View video courses
            </Link>
            <Link className="button button-secondary" href={`${studentBasePath}/messages${suffix}`}>
              Open academy messages
            </Link>
            <Link
              className="button button-secondary"
              href={studentBasePath === "/academy" ? "/" : `/portal/${portal.slug}`}
            >
              Enter mentor portal
            </Link>
          </>
        ) : null}
      </section>
    </main>
  );
}
