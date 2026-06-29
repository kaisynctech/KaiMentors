import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/preview-banner";
import { ProtectedLessonContent } from "@/components/protected-lesson-content";
import { requireMentorCourseContext } from "@/lib/course-access";
import styles from "./lesson.module.css";

export default async function PreviewLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) notFound();

  const [{ data: lesson }, { data: curriculum }] = await Promise.all([
    context.supabase
      .from("lessons")
      .select(
        "id,title,description,module_id,sort_order,course:courses!inner(id,title),module:course_modules!inner(id,title,sort_order),lesson_content_blocks(id,block_type,sort_order,media_id,content,media:course_media(id,media_type,title,processing_state),gallery_media:lesson_content_block_media(sort_order,caption,media:course_media(id,media_type,title,processing_state)))",
      )
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .eq("trader_id", context.traderId)
      .order("sort_order", { referencedTable: "lesson_content_blocks" })
      .maybeSingle(),
    context.supabase
      .from("lessons")
      .select("id,title,module_id,sort_order")
      .eq("course_id", courseId)
      .eq("trader_id", context.traderId)
      .order("sort_order"),
  ]);
  if (!lesson) notFound();

  const lessonModule = Array.isArray(lesson.module)
    ? lesson.module[0]
    : lesson.module;
  const course = Array.isArray(lesson.course)
    ? lesson.course[0]
    : lesson.course;

  const ordered = (curriculum ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const index = ordered.findIndex((l) => l.id === lessonId);
  const prev = ordered[index - 1] ?? null;
  const next = ordered[index + 1] ?? null;

  const blocks = (lesson.lesson_content_blocks ?? [])
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
          const media = Array.isArray(item.media) ? item.media[0] : item.media;
          return {
            sort_order: item.sort_order,
            caption: item.caption,
            media: media ?? null,
          };
        })
        .filter((item) => item.media?.processing_state === "ready"),
      content: (block.content ?? {}) as Record<string, unknown>,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className={styles.root}>
      <PreviewBanner />
      <nav className={styles.topNav}>
        <div className={styles.navLeft}>
          <Link
            className={styles.backLink}
            href={`/dashboard/courses/${courseId}/preview`}
          >
            ← Curriculum
          </Link>
          <span className={styles.navTitle}>
            {course?.title} · {lessonModule?.title}
          </span>
        </div>
        <div className={styles.navActions}>
          <Link href={`/dashboard/courses/${courseId}`}>Back to editor</Link>
        </div>
      </nav>

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
            completed={false}
            lessonId={lesson.id}
            previewMode
            resumeSeconds={0}
            watermark={`${course?.title ?? "Course"} · Preview`}
          />
        </div>

        {prev || next ? (
          <nav aria-label="Lesson navigation" className={styles.lessonNav}>
            {prev ? (
              <Link
                className={styles.prevBtn}
                href={`/dashboard/courses/${courseId}/preview/lessons/${prev.id}`}
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
                href={`/dashboard/courses/${courseId}/preview/lessons/${next.id}`}
              >
                Next lesson
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
