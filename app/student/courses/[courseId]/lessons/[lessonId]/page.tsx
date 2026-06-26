import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ProtectedLessonContent } from "@/components/protected-lesson-content";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./lesson.module.css";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
  searchParams?: Promise<{ portal?: string }>;
}) {
  const { courseId, lessonId } = await params;
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
    .select(
      "trader_id,full_name,email,portal:portals!inner(portal_name,slug)",
    )
    .eq("student_user_id", user.id)
    .eq("status", "verified");
  if (academy.portalId) aq = aq.eq("portal_id", academy.portalId);
  if (academy.portalSlug) aq = aq.eq("portal.slug", academy.portalSlug);
  const { data: app } = await aq.limit(1).maybeSingle();
  if (!app) redirect(`${academy.basePath}${academy.querySuffix}`);

  const [
    { data: lesson },
    { data: curriculum },
    { data: progress },
    { data: resources },
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id,title,description,module_id,sort_order,course:courses!inner(id,title,status),module:course_modules!inner(title,status,sort_order,requires_previous_completion),lesson_content_blocks(id,block_type,sort_order,media_id,content,media:course_media(id,media_type,title,processing_state),gallery_media:lesson_content_block_media(sort_order,caption,media:course_media(id,media_type,title,processing_state)))",
      )
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .eq("course.status", "published")
      .eq("module.status", "published")
      .order("sort_order", { referencedTable: "lesson_content_blocks" })
      .maybeSingle(),
    supabase
      .from("lessons")
      .select(
        "id,module_id,sort_order,module:course_modules!inner(sort_order,status)",
      )
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .eq("module.status", "published"),
    supabase
      .from("lesson_progress")
      .select("position_seconds,is_completed")
      .eq("lesson_id", lessonId)
      .eq("student_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("resources")
      .select(
        "id,title,type,external_url,media_id,sort_order,media:course_media(id,media_type,title,processing_state)",
      )
      .eq("lesson_id", lessonId)
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .order("sort_order"),
  ]);
  if (!lesson) notFound();

  const lessonModule = Array.isArray(lesson.module) ? lesson.module[0] : lesson.module;

  // ── Sequential gate check ────────────────────────────────────────────────────
  if (lessonModule?.requires_previous_completion) {
    const { data: prevMod } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .lt("sort_order", lessonModule.sort_order ?? 0)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevMod) {
      const { data: prevRequired } = await supabase
        .from("lessons")
        .select("id")
        .eq("module_id", prevMod.id)
        .eq("trader_id", app.trader_id)
        .eq("status", "published")
        .eq("is_required", true);

      if (prevRequired && prevRequired.length > 0) {
        const { count: doneCount } = await supabase
          .from("lesson_progress")
          .select("id", { count: "exact", head: true })
          .eq("student_user_id", user.id)
          .in("lesson_id", prevRequired.map((l) => l.id))
          .eq("is_completed", true);

        if ((doneCount ?? 0) < prevRequired.length) {
          redirect(`${academy.basePath}/courses/${courseId}${academy.querySuffix}`);
        }
      }
    }
  }
  // ── End gate check ────────────────────────────────────────────────────────────

  const ordered = (curriculum ?? []).sort((a, b) => {
    const am = Array.isArray(a.module) ? a.module[0] : a.module;
    const bm = Array.isArray(b.module) ? b.module[0] : b.module;
    return (
      (am?.sort_order ?? 0) - (bm?.sort_order ?? 0) ||
      a.sort_order - b.sort_order
    );
  });
  const index = ordered.findIndex((l) => l.id === lessonId);
  const prev = ordered[index - 1] ?? null;
  const next = ordered[index + 1] ?? null;

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const course = Array.isArray(lesson.course) ? lesson.course[0] : lesson.course;
  const base = academy.basePath;
  const suffix = academy.querySuffix;

  const blocks = [
    ...(lesson.lesson_content_blocks ?? [])
      .filter((block) => {
        const media = Array.isArray(block.media) ? block.media[0] : block.media;
        return !block.media_id || media?.processing_state === "ready";
      })
      .map((block) => ({
        ...block,
        media: Array.isArray(block.media)
          ? (block.media[0] ?? null)
          : (block.media ?? null),
        galleryMedia: (block.gallery_media ?? [])
          .map((item) => {
            const media = Array.isArray(item.media)
              ? item.media[0]
              : item.media;
            return {
              sort_order: item.sort_order,
              caption: item.caption,
              media: media ?? null,
            };
          })
          .filter((item) => item.media?.processing_state === "ready"),
        content: (block.content ?? {}) as Record<string, unknown>,
      })),
    ...(resources ?? []).map((resource) => {
      const media = Array.isArray(resource.media)
        ? resource.media[0]
        : resource.media;
      return {
        id: `resource-${resource.id}`,
        block_type: resource.external_url
          ? "link"
          : (media?.media_type ?? "link"),
        sort_order: 10000 + resource.sort_order,
        media_id: resource.media_id,
        content: resource.external_url
          ? { url: resource.external_url, label: resource.title }
          : { caption: resource.title },
        media: media ?? null,
        galleryMedia: [],
      };
    }),
  ].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark
          href={`${base}/courses${suffix}`}
          label={
            base === "/academy"
              ? (portal?.portal_name ?? "Academy")
              : "KaiMentors"
          }
        />
        <div className={styles.navActions}>
          <Link href={`${base}/courses/${courseId}${suffix}`}>
            Course curriculum
          </Link>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>

      <Link
        className={styles.backLink}
        href={`${base}/courses/${courseId}${suffix}`}
      >
        <ArrowLeft size={13} />
        Course curriculum
      </Link>

      <div className={styles.lessonHeader}>
        <p className="eyebrow">
          {course?.title} · {lessonModule?.title}
        </p>
        <h1>{lesson.title}</h1>
        {lesson.description ? <p>{lesson.description}</p> : null}
      </div>

      <div className={styles.playerCard}>
        <ProtectedLessonContent
          blocks={blocks}
          completed={progress?.is_completed ?? false}
          lessonId={lesson.id}
          resumeSeconds={progress?.position_seconds ?? 0}
          watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${app.email}`}
        />
      </div>

      {progress?.is_completed ? (
        <div className={styles.completionNotice} role="status">
          <CheckCircle2 size={18} />
          You have completed this lesson.
        </div>
      ) : null}

      {prev || next ? (
        <nav className={styles.lessonNav} aria-label="Lesson navigation">
          {prev ? (
            <Link
              className={styles.prevBtn}
              href={`${base}/courses/${courseId}/lessons/${prev.id}${suffix}`}
            >
              <ArrowLeft size={13} />
              Previous lesson
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              className={styles.nextBtn}
              href={`${base}/courses/${courseId}/lessons/${next.id}${suffix}`}
            >
              Next lesson
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
