import { AlignLeft, BookOpen, CheckCircle2, Clock3, ExternalLink, FileImage, FileText, Film, LayoutGrid, Lock, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { formatDuration } from "@/lib/courses";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./course-detail.module.css";

const BLOCK_TYPE_PRIORITY = ["video", "pdf", "gallery", "image", "rich_text", "link"] as const;

function getPrimaryBlockType(blocks: { block_type: string }[]): string | null {
  if (!blocks.length) return null;
  const types = new Set(blocks.map((b) => b.block_type));
  return BLOCK_TYPE_PRIORITY.find((t) => types.has(t)) ?? null;
}

function ContentTypeIcon({ type }: { type: string | null }) {
  if (type === "video") return <Film size={16} />;
  if (type === "pdf") return <FileText size={16} />;
  if (type === "gallery") return <LayoutGrid size={16} />;
  if (type === "image") return <FileImage size={16} />;
  if (type === "rich_text") return <AlignLeft size={16} />;
  if (type === "link") return <ExternalLink size={16} />;
  return <BookOpen size={16} />;
}

export default async function StudentCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{ portal?: string }>;
}) {
  const { courseId } = await params;
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let aq = supabase
    .from("student_applications")
    .select("trader_id,portal:portals!inner(portal_name,slug)")
    .eq("student_user_id", user.id)
    .eq("status", "verified");
  if (academy.portalId) aq = aq.eq("portal_id", academy.portalId);
  if (academy.portalSlug) aq = aq.eq("portal.slug", academy.portalSlug);
  const { data: app } = await aq.limit(1).maybeSingle();
  if (!app) redirect(`${academy.basePath}${academy.querySuffix}`);

  const [{ data: course }, { data: modules }, { data: lessons }, { data: progress }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id,title,description,cover_path")
        .eq("id", courseId)
        .eq("trader_id", app.trader_id)
        .eq("status", "published")
        .maybeSingle(),
      supabase
        .from("course_modules")
        .select("id,title,description,sort_order,is_required,requires_previous_completion")
        .eq("course_id", courseId)
        .eq("trader_id", app.trader_id)
        .eq("status", "published")
        .order("sort_order"),
      supabase
        .from("lessons")
        .select("id,module_id,title,description,duration_seconds,sort_order,is_required,blocks:lesson_content_blocks(block_type)")
        .eq("course_id", courseId)
        .eq("trader_id", app.trader_id)
        .eq("status", "published")
        .order("sort_order"),
      supabase
        .from("lesson_progress")
        .select("lesson_id,is_completed,is_started,position_seconds,last_activity_at")
        .eq("course_id", courseId)
        .eq("student_user_id", user.id),
    ]);
  if (!course) notFound();

  let thumbnailUrl: null | string = null;
  const admin = createAdminClient();
  if (course.cover_path && admin) {
    const { data: signed } = await admin.storage
      .from("course-content")
      .createSignedUrl(course.cover_path, 300);
    thumbnailUrl = signed?.signedUrl ?? null;
  }

  const required = (lessons ?? []).filter((l) => l.is_required);
  const completed = required.filter((l) =>
    (progress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
  ).length;
  const percent = required.length
    ? Math.round((completed / required.length) * 100)
    : 0;

  const inProgressSorted = (progress ?? [])
    .filter((p) => p.is_started && !p.is_completed)
    .sort((a, b) =>
      (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""),
    );
  const resumeLessonId = inProgressSorted[0]?.lesson_id ?? null;

  // Compute which modules are accessible (sequential gating)
  const accessibleModuleIds = new Set<string>();
  (modules ?? []).forEach((module, idx) => {
    if (!module.requires_previous_completion || idx === 0) {
      accessibleModuleIds.add(module.id);
      return;
    }
    const prev = (modules ?? [])[idx - 1];
    if (!prev) {
      accessibleModuleIds.add(module.id);
      return;
    }
    const prevRequired = (lessons ?? []).filter(
      (l) => l.module_id === prev.id && l.is_required,
    );
    const allDone =
      prevRequired.length > 0 &&
      prevRequired.every((l) =>
        (progress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
      );
    if (prevRequired.length === 0 || allDone) {
      accessibleModuleIds.add(module.id);
    }
  });

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const base = academy.basePath;
  const suffix = academy.querySuffix;

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark
          href={`${base}/courses${suffix}`}
          label={base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors"}
        />
        <div className={styles.navActions}>
          <Link href={`${base}/courses${suffix}`}>My learning</Link>
          <Link href={`${base}/messages${suffix}`}>Messages</Link>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCover}>
          {thumbnailUrl ? (
            <Image alt="" fill sizes="(max-width:900px) 100vw,280px" src={thumbnailUrl} unoptimized />
          ) : (
            <BookOpen size={36} />
          )}
        </div>
        <div className={styles.heroCopy}>
          <p className="eyebrow">{portal?.portal_name ?? "Academy"}</p>
          <h1>Course curriculum</h1>
          <p className={styles.courseDesc}>{course.description || "Work through the curriculum below."}</p>
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Course completion"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.progressLabel}>
            {percent}% complete · {completed}/{required.length} required lessons done
          </p>
        </div>
      </section>

      <section className={styles.curriculum}>
        {(modules ?? []).map((module) => {
          const moduleLessons = (lessons ?? []).filter(
            (l) => l.module_id === module.id,
          );
          const moduleRequiredLessons = moduleLessons.filter((l) => l.is_required);
          const isModuleComplete =
            moduleRequiredLessons.length > 0 &&
            moduleRequiredLessons.every((l) =>
              (progress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
            );
          const isAccessible = accessibleModuleIds.has(module.id);
          return (
            <div className={`${styles.moduleCard} ${!isAccessible ? styles.moduleCardLocked : ""}`} key={module.id}>
              <div className={styles.moduleHeader}>
                <div className={styles.moduleMeta}>
                  <h2>{module.title}</h2>
                  {module.description ? (
                    <p className={styles.moduleDesc}>{module.description}</p>
                  ) : null}
                </div>
                <div className={styles.moduleHeaderRight}>
                  {!isAccessible ? (
                    <Lock size={15} className={styles.moduleLockIcon} />
                  ) : isModuleComplete ? (
                    <CheckCircle2 className={styles.moduleComplete} size={16} />
                  ) : null}
                  <span>
                    {moduleLessons.length} lesson{moduleLessons.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              {isAccessible ? (
              <div className={styles.lessonList}>
                {moduleLessons.map((lesson) => {
                  const done = (progress ?? []).some(
                    (p) => p.lesson_id === lesson.id && p.is_completed,
                  );
                  const isResume = !done && lesson.id === resumeLessonId;
                  const lessonProg = (progress ?? []).find((p) => p.lesson_id === lesson.id);
                  const isInProgress = !!lessonProg?.is_started && !lessonProg?.is_completed;
                  const watchPercent =
                    isInProgress && lesson.duration_seconds && lessonProg?.position_seconds
                      ? Math.min(99, Math.round((lessonProg.position_seconds / lesson.duration_seconds) * 100))
                      : 0;
                  const primaryType = getPrimaryBlockType(
                    (lesson.blocks ?? []) as { block_type: string }[],
                  );
                  return (
                    <Link
                      className={`${styles.lessonRow} ${done ? styles.lessonDone : ""} ${isResume ? styles.lessonResume : ""}`}
                      href={`${base}/courses/${course.id}/lessons/${lesson.id}${suffix}`}
                      key={lesson.id}
                    >
                      <div className={styles.lessonIcon}>
                        {done ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <ContentTypeIcon type={primaryType} />
                        )}
                      </div>
                      <div className={styles.lessonMeta}>
                        <strong>{lesson.title}</strong>
                        {lesson.description ? <p>{lesson.description}</p> : null}
                        {!lesson.is_required ? (
                          <span className={styles.optionalBadge}>Optional</span>
                        ) : null}
                        {isInProgress && watchPercent > 0 ? (
                          <div
                            aria-label={`${watchPercent}% watched`}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={watchPercent}
                            className={styles.watchBar}
                            role="progressbar"
                          >
                            <span style={{ width: `${watchPercent}%` }} />
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.lessonRight}>
                        {isResume ? (
                          <span className={styles.resumeLabel}>
                            <PlayCircle size={13} /> Resume
                          </span>
                        ) : null}
                        <span className={styles.duration}>
                          <Clock3 size={11} /> {formatDuration(lesson.duration_seconds)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              ) : (
              <div className={styles.moduleLockedMessage}>
                <Lock size={13} />
                Complete the previous module to unlock this one.
              </div>
              )}
            </div>
          );
        })}
        {!modules?.length && (
          <div className={styles.empty}>
            <PlayCircle size={32} />
            <h2>No published curriculum</h2>
            <p>Your mentor is still preparing this course.</p>
          </div>
        )}
      </section>
    </main>
  );
}
