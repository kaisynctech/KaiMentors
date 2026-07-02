import { BookOpen, CheckCircle2, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./courses.module.css";

export const dynamic = "force-dynamic";

export default async function StudentCoursesPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${base}/login${suffix}`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/login${suffix}`);

  // Fetch application — any status
  let aq = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)",
    )
    .eq("student_user_id", user.id);
  if (academy.portalId) aq = aq.eq("portal_id", academy.portalId);
  if (academy.portalSlug) aq = aq.eq("portal.slug", academy.portalSlug);
  const { data: app } = await aq
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = portal?.portal_name ?? "Academy";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = app.status === "verified";

  // Shell wrapper — wraps both verified and unverified renders
  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={base}
        displayName={displayName}
        isVerified={isVerified}
        logoPath={portal?.logo_path ?? null}
        querySuffix={suffix}
        traderId={app?.trader_id}
      >
        {children}
      </StudentShell>
    );
  }

  // Unverified — ContentGate
  if (!isVerified) {
    return (
      <Shell>
        <div className={styles.page} style={{ paddingTop: 0 }}>
          <div className={styles.hero}>
            <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
            <h1>My Learning</h1>
            <p>
              Complete broker verification to unlock your courses.
            </p>
          </div>
          <ContentGate
            applicationStatus={app.status}
            returnPath={`${base}${suffix}`}
          />
        </div>
      </Shell>
    );
  }

  // Verified — full course list
  const [{ data: courseRows }, { data: progressRows }] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id,title,description,cover_path,sort_order,course_modules(id,title),lessons(id,is_required,status,title,module_id)",
      )
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .order("sort_order"),
    supabase
      .from("lesson_progress")
      .select(
        "course_id,lesson_id,position_seconds,is_started,is_completed,last_activity_at",
      )
      .eq("trader_id", app.trader_id)
      .eq("student_user_id", user.id),
  ]);

  const admin = createAdminClient();

  const courses = await Promise.all(
    (courseRows ?? []).map(async (c) => {
      const allLessons = (c.lessons ?? []) as Array<{
        id: string;
        is_required: boolean;
        status: string;
        title: string;
        module_id: string | null;
      }>;
      const modules = (c.course_modules ?? []) as Array<{
        id: string;
        title: string;
      }>;
      const required = allLessons.filter(
        (l) => l.status === "published" && l.is_required,
      );
      const progress = (progressRows ?? []).filter(
        (p) => p.course_id === c.id,
      );
      const complete = required.filter((l) =>
        progress.some((p) => p.lesson_id === l.id && p.is_completed),
      ).length;

      let thumbnailUrl: string | null = null;
      if (c.cover_path && admin) {
        const { data: signed } = await admin.storage
          .from("course-content")
          .createSignedUrl(c.cover_path, 300);
        thumbnailUrl = signed?.signedUrl ?? null;
      }

      const resumeRow =
        progress
          .filter((p) => p.is_started && !p.is_completed)
          .sort((a, b) =>
            (b.last_activity_at ?? "").localeCompare(
              a.last_activity_at ?? "",
            ),
          )[0] ?? null;

      const resumeLesson = resumeRow
        ? (allLessons.find((l) => l.id === resumeRow.lesson_id) ?? null)
        : null;
      const resumeModule = resumeLesson?.module_id
        ? (modules.find((m) => m.id === resumeLesson.module_id) ?? null)
        : null;

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        thumbnailUrl,
        lessonCount: required.length,
        percent:
          required.length > 0
            ? Math.round((complete / required.length) * 100)
            : 0,
        complete: required.length > 0 && complete === required.length,
        lastActivity:
          progress.map((p) => p.last_activity_at).sort().at(-1) ?? null,
        resume: resumeRow,
        resumeLesson,
        resumeModule,
      };
    }),
  );

  const continueCourse =
    courses
      .filter((c) => c.resume && !c.complete)
      .sort((a, b) =>
        (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""),
      )[0] ?? null;

  const completed = courses.filter((c) => c.complete);

  return (
    <Shell>
      <main className={styles.page}>
        <div className={styles.hero}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>My Learning</h1>
          <p>
            Resume protected lessons, track your progress, and revisit
            completed courses.
          </p>
        </div>

        {/* Resume card */}
        {continueCourse && continueCourse.resume ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <p className="eyebrow">Continue Watching</p>
              <h2>Pick up where you left off</h2>
            </div>
            <div className={styles.resumeCard}>
              <div className={styles.resumeThumbnail}>
                {continueCourse.thumbnailUrl ? (
                  <Image
                    alt=""
                    fill
                    sizes="180px"
                    src={continueCourse.thumbnailUrl}
                    unoptimized
                  />
                ) : (
                  <BookOpen size={28} />
                )}
              </div>
              <div className={styles.resumeBody}>
                <p className="eyebrow">{continueCourse.title}</p>
                <p className={styles.resumeTitle}>
                  {continueCourse.resumeLesson?.title ?? "Continue learning"}
                </p>
                {continueCourse.resumeModule ? (
                  <p className={styles.resumeModule}>
                    {continueCourse.resumeModule.title}
                  </p>
                ) : null}
                <div className={styles.resumeProgress}>
                  <span style={{ width: `${continueCourse.percent}%` }} />
                </div>
                <p className={styles.resumeProgressLabel}>
                  {continueCourse.percent}% ·{" "}
                  {continueCourse.lessonCount} required lesson
                  {continueCourse.lessonCount === 1 ? "" : "s"}
                </p>
                <Link
                  className={styles.resumeBtn}
                  href={`${base}/courses/${continueCourse.id}/lessons/${continueCourse.resume.lesson_id}${suffix}`}
                >
                  <PlayCircle size={16} />
                  Resume lesson
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {/* Library */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <p className="eyebrow">Library</p>
            <h2>Available courses</h2>
          </div>
          {courses.length > 0 ? (
            <div className={styles.grid}>
              {courses.map((course) => (
                <Link
                  className={styles.courseCard}
                  href={`${base}/courses/${course.id}${suffix}`}
                  key={course.id}
                >
                  <div className={styles.cardThumbnail}>
                    {course.thumbnailUrl ? (
                      <Image
                        alt=""
                        fill
                        sizes="(max-width: 600px) 100vw, 360px"
                        src={course.thumbnailUrl}
                        unoptimized
                      />
                    ) : (
                      <BookOpen size={24} />
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{course.title}</p>
                    <p className={styles.cardMeta}>
                      {course.lessonCount} required lesson
                      {course.lessonCount === 1 ? "" : "s"}
                    </p>
                    <div className={styles.cardProgress}>
                      <span style={{ width: `${course.percent}%` }} />
                    </div>
                    <p className={styles.cardProgressLabel}>
                      {course.percent}%
                    </p>
                    {course.complete ? (
                      <span className={styles.completedBadge}>
                        <CheckCircle2 size={10} />
                        Completed
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <BookOpen size={32} />
              <h2>No available courses</h2>
              <p>
                No courses enrolled yet. Your courses will appear here once
                access is granted.
              </p>
            </div>
          )}
        </section>

        {/* Completed */}
        {completed.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <p className="eyebrow">Completed</p>
              <h2>
                <CheckCircle2
                  size={20}
                  style={{ verticalAlign: "middle", marginRight: 8 }}
                />
                Finished courses
              </h2>
            </div>
            <div className={styles.grid}>
              {completed.map((course) => (
                <Link
                  className={styles.courseCard}
                  href={`${base}/courses/${course.id}${suffix}`}
                  key={course.id}
                >
                  <div className={styles.cardThumbnail}>
                    {course.thumbnailUrl ? (
                      <Image
                        alt=""
                        fill
                        sizes="(max-width: 600px) 100vw, 360px"
                        src={course.thumbnailUrl}
                        unoptimized
                      />
                    ) : (
                      <BookOpen size={24} />
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{course.title}</p>
                    <p className={styles.cardMeta}>
                      {course.lessonCount} required lesson
                      {course.lessonCount === 1 ? "" : "s"}
                    </p>
                    <div className={styles.cardProgress}>
                      <span style={{ width: "100%" }} />
                    </div>
                    <span className={styles.completedBadge}>
                      <CheckCircle2 size={10} />
                      Completed
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </Shell>
  );
}
