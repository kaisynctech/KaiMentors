import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrokerGuideCard } from "@/components/broker-guide-card";
import { StudentShell } from "@/components/student-shell";
import { VerifyAccountForm } from "@/components/verify-account-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./student.module.css";

export const dynamic = "force-dynamic";

interface StudentPageProps {
  searchParams?: Promise<{ portal?: string }>;
}

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath, querySuffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${basePath}/login${querySuffix}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${basePath}/login${querySuffix}`);

  // Application query — any status (dashboard is the status hub)
  let appQuery = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,status_reason,portal_id,verification_screenshot_path,portal:portals!inner(portal_name,slug,logo_path)",
    )
    .eq("student_user_id", user.id);
  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);
  // Without portal context, skip rejected applications so a dual-role user with
  // a rejected application at one academy still lands on their active application.
  if (!academy.portalId && !academy.portalSlug) appQuery = appQuery.neq("status", "rejected");

  const { data: application } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) redirect(`${basePath}/join-academy${querySuffix}`);

  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;

  const academyName =
    basePath === "/academy"
      ? (portal?.portal_name ?? "Academy")
      : "KaiMentors";

  const displayName = user.email?.split("@")[0] ?? "Student";
  const status = application.status;
  const isVerified = status === "verified";

  // Fetch broker guides via SECURITY DEFINER RPC — now returns all active connections
  const { data: guideRows } = await supabase.rpc("get_student_broker_guide", {
    p_portal_id: application.portal_id,
  });
  const brokerGuides = (Array.isArray(guideRows) ? guideRows : guideRows ? [guideRows] : []) as import("@/lib/database.types").StudentBrokerGuide[];

  // Dashboard data — only for verified students
  let lessonProgress: Array<{
    course_id: string;
    lesson_id: string;
    is_started: boolean;
    is_completed: boolean;
    last_activity_at: string | null;
    lesson: { title: string; module_id: string | null } | null;
    course: { title: string; cover_path: string | null } | null;
  }> = [];
  let nextLiveClass: {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    join_url: string;
  } | null = null;
  let announcements: Array<{
    id: string;
    title: string;
    body: string;
    is_pinned: boolean;
    published_at: string | null;
  }> = [];
  let courseCount = 0;

  if (isVerified) {
    const now = new Date().toISOString();
    const [progressResult, liveResult, announcementsResult, coursesResult] =
      await Promise.all([
        supabase
          .from("lesson_progress")
          .select(
            "course_id,lesson_id,is_started,is_completed,last_activity_at,lesson:lessons(title,module_id),course:courses(title,cover_path)",
          )
          .eq("trader_id", application.trader_id)
          .eq("student_user_id", user.id)
          .order("last_activity_at", { ascending: false })
          .limit(10),
        supabase
          .from("live_classes")
          .select("id,title,description,starts_at,ends_at,join_url")
          .eq("trader_id", application.trader_id)
          .eq("status", "published")
          .gte("starts_at", now)
          .order("starts_at")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("announcements")
          .select("id,title,body,is_pinned,published_at")
          .eq("trader_id", application.trader_id)
          .eq("status", "published")
          .order("is_pinned", { ascending: false })
          .order("published_at", { ascending: false })
          .limit(3),
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("trader_id", application.trader_id)
          .eq("status", "published"),
      ]);

    lessonProgress = (progressResult.data ?? []) as unknown as typeof lessonProgress;
    nextLiveClass = liveResult.data as {
      id: string;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string | null;
      join_url: string;
    } | null;
    announcements = announcementsResult.data ?? [];
    courseCount = coursesResult.count ?? 0;
  }

  const continueLearning = lessonProgress.find(
    (p) => p.is_started && !p.is_completed,
  ) ?? null;

  const lessonsCompleted = lessonProgress.filter((p) => p.is_completed).length;

  // Signed URL for continue-learning thumbnail
  let continueThumbnailUrl: string | null = null;
  if (continueLearning?.course?.cover_path) {
    const admin = createAdminClient();
    if (admin) {
      const { data: signed } = await admin.storage
        .from("course-content")
        .createSignedUrl(continueLearning.course.cover_path, 300);
      continueThumbnailUrl = signed?.signedUrl ?? null;
    }
  }

  // Status display
  const statusConfig = {
    pending: {
      icon: <Clock3 size={22} />,
      iconClass: styles.statusIconPending,
      title: "Your academy access is being reviewed.",
      body: "We'll notify you once your broker account has been verified.",
    },
    processing: {
      icon: <Clock3 size={22} />,
      iconClass: styles.statusIconPending,
      title: "We're checking your verification details.",
      body: "This usually completes within a few minutes.",
    },
    manual_review: {
      icon: <AlertCircle size={22} />,
      iconClass: styles.statusIconInfo,
      title: "More information is needed.",
      body:
        application.status_reason ??
        "Your mentor has requested additional details before approving your access.",
    },
    rejected: {
      icon: <AlertCircle size={22} />,
      iconClass: styles.statusIconRejected,
      title: "Your application could not be approved.",
      body:
        application.status_reason ??
        "Please contact the academy for support.",
    },
    verified: {
      icon: <CheckCircle2 size={22} />,
      iconClass: styles.statusIconVerified,
      title: "You have full academy access.",
      body: `Welcome to ${portal?.portal_name ?? "your mentor academy"}.`,
    },
    processing_default: {
      icon: <Clock3 size={22} />,
      iconClass: styles.statusIconPending,
      title: "Your application is under review.",
      body: "We'll notify you once your access is ready.",
    },
  } as const;

  const statusDisplay =
    statusConfig[status as keyof typeof statusConfig] ??
    statusConfig.processing_default;

  return (
    <StudentShell
      academyName={academyName}
      basePath={basePath}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      querySuffix={querySuffix}
    >
      <div className={styles.dashboard}>
        <div className={styles.pageHeader}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>Dashboard</h1>
        </div>

        {/* Status card */}
        <div className={styles.statusCard}>
          <div className={`${styles.statusIcon} ${statusDisplay.iconClass}`}>
            {statusDisplay.icon}
          </div>
          <div>
            <p className={styles.statusTitle}>{statusDisplay.title}</p>
            <p className={styles.statusBody}>{statusDisplay.body}</p>
          </div>
        </div>

        {/* Verified dashboard sections */}
        {isVerified ? (
          <>
            {/* Stat cards */}
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <p className={styles.statValue}>{courseCount}</p>
                <p className={styles.statLabel}>Courses available</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statValue}>{lessonsCompleted}</p>
                <p className={styles.statLabel}>Lessons completed</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statValue}>{announcements.length}</p>
                <p className={styles.statLabel}>Announcements</p>
              </div>
            </div>

            {/* Continue learning */}
            {continueLearning ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>Continue learning</h2>
                  <Link
                    className={styles.sectionLink}
                    href={`${basePath}/courses${querySuffix}`}
                  >
                    All courses →
                  </Link>
                </div>
                <Link
                  className={styles.continueCard}
                  href={`${basePath}/courses/${continueLearning.course_id}/lessons/${continueLearning.lesson_id}${querySuffix}`}
                >
                  <div className={styles.continueThumbnail}>
                    {continueThumbnailUrl ? (
                      <Image
                        alt=""
                        fill
                        sizes="80px"
                        src={continueThumbnailUrl}
                        unoptimized
                      />
                    ) : (
                      <BookOpen size={24} />
                    )}
                  </div>
                  <div className={styles.continueBody}>
                    <p className={styles.continueCourseName}>
                      {continueLearning.course?.title ?? "Course"}
                    </p>
                    <p className={styles.continueLessonTitle}>
                      {(continueLearning.lesson as { title?: string } | null)?.title ??
                        "Continue learning"}
                    </p>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${Math.min(100, (lessonsCompleted / Math.max(lessonProgress.length, 1)) * 100)}%` }}
                      />
                    </div>
                    <p className={styles.progressLabel}>
                      {lessonsCompleted} lesson{lessonsCompleted === 1 ? "" : "s"} completed
                    </p>
                  </div>
                </Link>
              </section>
            ) : null}

            {/* Next live class */}
            {nextLiveClass ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>Next live class</h2>
                  <Link
                    className={styles.sectionLink}
                    href={`${basePath}/live-classes${querySuffix}`}
                  >
                    View all →
                  </Link>
                </div>
                <div className={styles.liveCard}>
                  <div className={styles.liveTimeBadge}>
                    <span className={styles.liveTimeDay}>
                      {new Date(nextLiveClass.starts_at).toLocaleDateString(
                        undefined,
                        { weekday: "short" },
                      )}
                    </span>
                    <span className={styles.liveTimeHour}>
                      {new Date(nextLiveClass.starts_at).toLocaleTimeString(
                        undefined,
                        { hour: "2-digit", minute: "2-digit", hour12: false },
                      )}
                    </span>
                  </div>
                  <div className={styles.liveBody}>
                    <p className={styles.liveTitle}>{nextLiveClass.title}</p>
                    <p className={styles.liveMeta}>
                      {new Date(nextLiveClass.starts_at).toLocaleDateString(
                        undefined,
                        { dateStyle: "long" },
                      )}
                      {nextLiveClass.ends_at
                        ? ` · ends ${new Date(nextLiveClass.ends_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`
                        : ""}
                    </p>
                  </div>
                  <a
                    className={styles.liveJoin}
                    href={nextLiveClass.join_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Video size={14} />
                    Join
                    <ExternalLink size={12} />
                  </a>
                </div>
              </section>
            ) : null}

            {/* Announcements */}
            {announcements.length > 0 ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>Announcements</h2>
                </div>
                <div className={styles.announcementList}>
                  {announcements.map((a) => (
                    <div
                      className={`${styles.announcement} ${a.is_pinned ? styles.announcementPinned : ""}`}
                      key={a.id}
                    >
                      <p className={styles.announcementTitle}>{a.title}</p>
                      <p className={styles.announcementBody}>{a.body}</p>
                      {a.published_at ? (
                        <p className={styles.announcementDate}>
                          {new Date(a.published_at).toLocaleDateString(
                            undefined,
                            { dateStyle: "medium" },
                          )}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {/* Verification form — visible to all unverified students */}
        {!isVerified && status !== "rejected" ? (
          <VerifyAccountForm
            brokers={brokerGuides.map((g) => ({
              id: g.id,
              broker_name: g.broker_name,
              verification_method: g.verification_method,
            }))}
            portalId={application.portal_id}
            querySuffix={querySuffix}
          />
        ) : null}

        {/* Broker guide — always visible */}
        <BrokerGuideCard
          applicationStatus={status}
          currentScreenshotPath={application.verification_screenshot_path ?? null}
          guides={brokerGuides}
          portalId={application.portal_id}
          studentUserId={user.id}
          traderId={application.trader_id}
        />
      </div>
    </StudentShell>
  );
}
