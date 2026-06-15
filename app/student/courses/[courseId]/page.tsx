import { BookOpen, Clock3, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { formatDuration } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";
import { getStudentBasePath } from "@/lib/student-routing";
import styles from "../courses.module.css";

interface StudentCoursePageProps {
  params: Promise<{ courseId: string }>;
}

export default async function StudentCoursePage({
  params,
}: StudentCoursePageProps) {
  const { courseId } = await params;
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

  const [{ data: course }, { data: lessons }] = await Promise.all([
    supabase
      .from("courses")
      .select("id,title,description,cover_path")
      .eq("id", courseId)
      .eq("trader_id", application.trader_id)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id,title,description,duration_seconds,sort_order")
      .eq("course_id", courseId)
      .eq("trader_id", application.trader_id)
      .eq("status", "published")
      .order("sort_order")
      .order("created_at"),
  ]);
  if (!course) notFound();

  let thumbnailUrl: string | null = null;
  if (course.cover_path) {
    const { data: signed } = await supabase.storage
      .from("course-content")
      .createSignedUrl(course.cover_path, 3600);
    thumbnailUrl = signed?.signedUrl ?? null;
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={`${studentBasePath}/courses`} label={brandLabel} />
        <div className={styles.navActions}>
          <Link href={`${studentBasePath}/courses`}>All courses</Link>
          <Link href={`${studentBasePath}/messages`}>Messages</Link>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>
      <section className={`${styles.content} ${styles.detail}`}>
        <div className={styles.detailCover}>
          {thumbnailUrl ? (
            <Image
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 440px"
              src={thumbnailUrl}
              unoptimized
            />
          ) : (
            <BookOpen size={42} />
          )}
        </div>
        <div className={styles.detailCopy}>
          <p className="eyebrow">Video course</p>
          <h1>{course.title}</h1>
          <p>{course.description || "Work through the lessons below."}</p>
        </div>
      </section>
      <section className={`${styles.content} ${styles.curriculum}`}>
        {lessons?.length ? (
          lessons.map((lesson) => (
            <Link
              className={styles.lesson}
              href={`${studentBasePath}/courses/${course.id}/lessons/${lesson.id}`}
              key={lesson.id}
            >
              <div className={styles.lessonNumber}>{lesson.sort_order}</div>
              <div>
                <h3>{lesson.title}</h3>
                <p>{lesson.description || "Video lesson"}</p>
              </div>
              <span>
                <Clock3 size={14} /> {formatDuration(lesson.duration_seconds)}
                <PlayCircle size={14} />
              </span>
            </Link>
          ))
        ) : (
          <div className={styles.empty}>
            <PlayCircle size={30} />
            <h2>No published lessons yet</h2>
            <p>Your mentor is still preparing this curriculum.</p>
          </div>
        )}
      </section>
    </main>
  );
}
