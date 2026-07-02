import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LessonSidebar } from "@/components/lesson-sidebar";
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
      "trader_id,full_name,portal:portals!inner(portal_name,slug)",
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
    { data: allProgress },
    { data: resources },
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id,title,description,module_id,sort_order,is_required,course:courses!inner(id,title,status),module:course_modules!inner(title,status,sort_order,requires_previous_completion),lesson_content_blocks(id,block_type,sort_order,media_id,content,media:course_media(id,media_type,title,processing_state),gallery_media:lesson_content_block_media(sort_order,caption,media:course_media(id,media_type,title,processing_state)))",
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
        "id,title,module_id,sort_order,is_required,module:course_modules!inner(id,title,sort_order,status)",
      )
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .eq("module.status", "published"),
    supabase
      .from("lesson_progress")
      .select("lesson_id,position_seconds,is_completed,is_started")
      .eq("course_id", courseId)
      .eq("student_user_id", user.id),
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

  const currentLessonIsRequired = lesson.is_required ?? true;
  const otherRequired = ordered.filter(
    (l) => l.is_required && l.id !== lessonId,
  );
  const otherRequiredDone = otherRequired.every((l) =>
    (allProgress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
  );
  const alreadyComplete = (allProgress ?? []).some(
    (p) => p.lesson_id === lessonId && p.is_completed,
  );
  const courseWillBeComplete =
    currentLessonIsRequired && otherRequiredDone && !alreadyComplete;

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const course = Array.isArray(lesson.course) ? lesson.course[0] : lesson.course;
  const base = academy.basePath;
  const suffix = academy.querySuffix;

  const progress = (allProgress ?? []).find((p) => p.lesson_id === lessonId) ?? null;

  // Build sidebar modules from curriculum + progress
  const modulesMap = new Map<string, {
    id: string;
    title: string;
    sort_order: number;
    lessons: Array<{ id: string; title: string; is_completed: boolean }>;
  }>();

  for (const l of (curriculum ?? [])) {
    const m = Array.isArray(l.module) ? l.module[0] : l.module;
    if (!m?.id || !m?.title) continue;
    if (!modulesMap.has(m.id)) {
      modulesMap.set(m.id, {
        id: m.id,
        title: m.title,
        sort_order: m.sort_order ?? 0,
        lessons: [],
      });
    }
    const prog = (allProgress ?? []).find((p) => p.lesson_id === l.id);
    modulesMap.get(m.id)!.lessons.push({
      id: l.id,
      title: l.title ?? "",
      is_completed: prog?.is_completed ?? false,
    });
  }

  const sidebarModules = Array.from(modulesMap.values()).sort(
    (a, b) => a.sort_order - b.sort_order,
  );

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
    <div className={styles.root}>
      <nav className={styles.topNav}>
        <BrandMark
          href={`${base}/courses/${courseId}${suffix}`}
          label={
            portal?.portal_name ?? "Academy"
          }
        />
        <div className={styles.navActions}>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>

      <div className={styles.layout}>
        <LessonSidebar
          base={base}
          courseId={courseId}
          courseTitle={course?.title ?? ""}
          currentLessonId={lessonId}
          modules={sidebarModules}
          suffix={suffix}
        />

        <main className={styles.main}>
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
              courseId={courseId}
              courseWillBeComplete={courseWillBeComplete}
              lessonId={lesson.id}
              resumeSeconds={progress?.position_seconds ?? 0}
              watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${user.email ?? ""}`}
            />
          </div>

          {progress?.is_completed ? (
            <div className={styles.completionNotice} role="status">
              <CheckCircle2 size={18} />
              You have completed this lesson.
            </div>
          ) : null}

          {prev || next ? (
            <nav aria-label="Lesson navigation" className={styles.lessonNav}>
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
      </div>
    </div>
  );
}
