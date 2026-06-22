"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  ImagePlus,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./course-manager.module.css";

interface CourseListItem {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  sort_order: number;
  thumbnailUrl: string | null;
  lessonCount: number;
}

export function CourseManager({ courses }: { courses: CourseListItem[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function createCourse(formData: FormData) {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/courses", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The course could not be created.");
      return;
    }
    router.push(`/dashboard/courses/${payload.courseId}`);
    router.refresh();
  }

  return (
    <div className={styles.layout}>
      <section className={styles.createCard}>
        <div className={styles.heading}>
          <span>New course</span>
          <h2>Create a course</h2>
          <p>
            Start with the course details, then build modules, lessons, and mixed-media content.
          </p>
        </div>
        <form action={createCourse}>
          <label>
            Title
            <input maxLength={160} name="title" required />
          </label>
          <label>
            Description
            <textarea maxLength={1200} name="description" rows={4} />
          </label>
          <div className={styles.twoColumns}>
            <label>
              Status
              <select defaultValue="draft" name="status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Sort order
              <input defaultValue="0" min="0" name="sortOrder" type="number" />
            </label>
          </div>
          <label className={styles.upload}>
            <ImagePlus size={19} />
            <span>
              <strong>Course thumbnail</strong>
              <small>Optional PNG, JPG, or WebP up to 5 MB.</small>
            </span>
            <input
              accept="image/png,image/jpeg,image/webp"
              name="thumbnail"
              type="file"
            />
          </label>
          {message ? <p className={styles.error}>{message}</p> : null}
          <button disabled={state === "saving"} type="submit">
            {state === "saving" ? (
              <Loader2 className={styles.spin} size={18} />
            ) : null}
            Create course
          </button>
        </form>
      </section>

      <section className={styles.library}>
        <div className={styles.libraryHeading}>
          <div>
            <span>Course library</span>
            <h2>{courses.length} course{courses.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
        {courses.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Course</th><th>Status</th><th>Lessons</th><th>Order</th><th>Action</th></tr></thead>
              <tbody>{courses.map((course) => (
                <tr key={course.id}>
                  <td><div className={styles.courseIdentity}><div className={styles.thumbnail}>{course.thumbnailUrl ? <Image alt="" fill sizes="48px" src={course.thumbnailUrl} unoptimized /> : <BookOpen size={19} />}</div><div><strong>{course.title}</strong><span>{course.description || "No description added."}</span></div></div></td>
                  <td><span className={`${styles.status} ${styles[course.status]}`}>{course.status === "published" ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}{course.status}</span></td>
                  <td>{course.lessonCount}</td>
                  <td>{course.sort_order}</td>
                  <td><Link className={styles.manage} href={`/dashboard/courses/${course.id}`}>Manage</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <BookOpen size={30} />
            <h3>No courses yet</h3>
            <p>Create your first course using the form.</p>
          </div>
        )}
      </section>
    </div>
  );
}
