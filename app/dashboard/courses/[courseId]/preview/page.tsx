import { BookOpen, Clock3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/preview-banner";
import { formatDuration } from "@/lib/courses";
import { requireMentorCourseContext } from "@/lib/course-access";
import styles from "./preview.module.css";

export default async function PreviewCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) notFound();

  const [{ data: course }, { data: modules }, { data: lessons }] =
    await Promise.all([
      context.supabase
        .from("courses")
        .select("id,title,description")
        .eq("id", courseId)
        .eq("trader_id", context.traderId)
        .maybeSingle(),
      context.supabase
        .from("course_modules")
        .select("id,title,description,sort_order,status")
        .eq("course_id", courseId)
        .eq("trader_id", context.traderId)
        .order("sort_order"),
      context.supabase
        .from("lessons")
        .select(
          "id,module_id,title,description,duration_seconds,sort_order,status",
        )
        .eq("course_id", courseId)
        .eq("trader_id", context.traderId)
        .order("sort_order"),
    ]);
  if (!course) notFound();

  return (
    <div className={styles.page}>
      <PreviewBanner />
      <nav className={styles.nav}>
        <Link className={styles.backLink} href={`/dashboard/courses/${courseId}`}>
          ← Back to editor
        </Link>
        <span className={styles.courseTitle}>{course.title}</span>
      </nav>

      <section className={styles.curriculum}>
        {(modules ?? []).map((module) => {
          const moduleLessons = (lessons ?? []).filter(
            (l) => l.module_id === module.id,
          );
          return (
            <div className={styles.moduleCard} key={module.id}>
              <div className={styles.moduleHeader}>
                <h2>{module.title}</h2>
                {module.status !== "published" && (
                  <span className={styles.draftBadge}>{module.status}</span>
                )}
              </div>
              {module.description ? (
                <p className={styles.moduleDesc}>{module.description}</p>
              ) : null}
              <div className={styles.lessonList}>
                {moduleLessons.map((lesson) => (
                  <Link
                    className={styles.lessonRow}
                    href={`/dashboard/courses/${courseId}/preview/lessons/${lesson.id}`}
                    key={lesson.id}
                  >
                    <div className={styles.lessonTitle}>
                      {lesson.title}
                      {lesson.status !== "published" && (
                        <span className={styles.draftBadge}>
                          {lesson.status}
                        </span>
                      )}
                    </div>
                    <span className={styles.duration}>
                      <Clock3 size={11} />
                      {formatDuration(lesson.duration_seconds)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {!modules?.length && (
          <div className={styles.empty}>
            <BookOpen size={32} />
            <h2>No curriculum yet</h2>
            <p>Add modules and lessons in the course editor.</p>
          </div>
        )}
      </section>
    </div>
  );
}
