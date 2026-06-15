import { BookOpen, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { createClient } from "@/lib/supabase/server";
import { getStudentBasePath } from "@/lib/student-routing";
import styles from "./courses.module.css";

export default async function StudentCoursesPage() {
  const studentBasePath = await getStudentBasePath();
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: application } = await supabase
    .from("student_applications")
    .select("trader_id,status,portal:portals(portal_name)")
    .eq("student_user_id", user.id)
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!application) redirect(studentBasePath);

  const { data } = await supabase
    .from("courses")
    .select(
      "id,title,description,cover_path,sort_order,lessons(count)",
    )
    .eq("trader_id", application.trader_id)
    .eq("status", "published")
    .order("sort_order")
    .order("created_at");

  const courses = await Promise.all(
    (data ?? []).map(async (course) => {
      let thumbnailUrl: string | null = null;
      if (course.cover_path) {
        const { data: signed } = await supabase.storage
          .from("course-content")
          .createSignedUrl(course.cover_path, 3600);
        thumbnailUrl = signed?.signedUrl ?? null;
      }
      const lessonCount = Array.isArray(course.lessons)
        ? (course.lessons[0]?.count ?? 0)
        : 0;
      return { ...course, thumbnailUrl, lessonCount };
    }),
  );
  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;
  const brandLabel =
    studentBasePath === "/academy"
      ? portal?.portal_name ?? "Academy"
      : "KaiMentors";

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={`${studentBasePath}/courses`} label={brandLabel} />
        <div className={styles.navActions}>
          <Link href={`${studentBasePath}/messages`}>Messages</Link>
          <Link href={studentBasePath}>Access status</Link>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>
      <header className={styles.header}>
        <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
        <h1>Your video course library.</h1>
        <p>
          Continue through structured lessons available only to verified
          students.
        </p>
      </header>
      <section className={styles.content}>
        {courses.length ? (
          <div className={styles.grid}>
            {courses.map((course) => (
              <Link
                className={styles.course}
                href={`${studentBasePath}/courses/${course.id}`}
                key={course.id}
              >
                <div className={styles.thumbnail}>
                  {course.thumbnailUrl ? (
                    <Image
                      alt=""
                      fill
                      sizes="(max-width: 600px) 100vw, 360px"
                      src={course.thumbnailUrl}
                      unoptimized
                    />
                  ) : (
                    <BookOpen size={32} />
                  )}
                </div>
                <div className={styles.courseBody}>
                  <h2>{course.title}</h2>
                  <p>{course.description || "Video course"}</p>
                  <span>
                    <PlayCircle size={15} /> {course.lessonCount} lesson
                    {course.lessonCount === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <BookOpen size={32} />
            <h2>No published courses yet</h2>
            <p>Your mentor is still preparing the course library.</p>
          </div>
        )}
      </section>
    </main>
  );
}
