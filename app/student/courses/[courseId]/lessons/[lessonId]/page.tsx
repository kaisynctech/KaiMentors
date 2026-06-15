import { Clock3 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { formatDuration } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";
import { getStudentBasePath } from "@/lib/student-routing";
import styles from "../../../courses.module.css";

interface LessonPlayerPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function LessonPlayerPage({
  params,
}: LessonPlayerPageProps) {
  const { courseId, lessonId } = await params;
  const studentBasePath = await getStudentBasePath();
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: application } = await supabase
    .from("student_applications")
    .select("trader_id,portal:portals(portal_name)")
    .eq("student_user_id", user.id)
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  if (!application) redirect(studentBasePath);
  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;
  const brandLabel =
    studentBasePath === "/academy"
      ? portal?.portal_name ?? "Academy"
      : "KaiMentors";

  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      "id,title,description,duration_seconds,video_path,course:courses!inner(id,title,status)",
    )
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("trader_id", application.trader_id)
    .eq("status", "published")
    .eq("course.status", "published")
    .maybeSingle();
  if (!lesson || !lesson.video_path) notFound();

  const { data: signed } = await supabase.storage
    .from("course-content")
    .createSignedUrl(lesson.video_path, 3600);
  if (!signed?.signedUrl) notFound();

  const course = Array.isArray(lesson.course)
    ? lesson.course[0]
    : lesson.course;

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={`${studentBasePath}/courses`} label={brandLabel} />
        <div className={styles.navActions}>
          <Link href={`${studentBasePath}/courses/${courseId}`}>
            Back to {course?.title ?? "course"}
          </Link>
          <Link href={`${studentBasePath}/messages`}>Messages</Link>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>
      <section className={`${styles.content} ${styles.playerCard}`}>
        <video
          className={styles.video}
          controls
          controlsList="nodownload"
          playsInline
          preload="metadata"
          src={signed.signedUrl}
        >
          Your browser does not support HTML video.
        </video>
        <div className={styles.playerCopy}>
          <p className="eyebrow">{course?.title ?? "Course lesson"}</p>
          <h1>{lesson.title}</h1>
          <p>{lesson.description || "Video lesson"}</p>
          <div className={styles.playerMeta}>
            <Clock3 size={15} /> {formatDuration(lesson.duration_seconds)}
          </div>
        </div>
      </section>
    </main>
  );
}
