"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Plus,
  Users,
  X,
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
  publishedLessonCount: number;
  moduleCount: number;
  activeLearnerCount: number;
}

interface CourseStats {
  totalCourses: number;
  published: number;
  totalLessons: number;
  activeLearners: number;
}

type FilterStatus = "all" | "published" | "draft" | "archived";

const FILTERS: Array<{ label: string; value: FilterStatus }> = [
  { label: "All", value: "all" },
  { label: "Published", value: "published" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

function CourseLibraryCard({ course }: { course: CourseListItem }) {
  const completionPct =
    course.lessonCount > 0
      ? Math.round((course.publishedLessonCount / course.lessonCount) * 100)
      : 0;

  return (
    <Link className={styles.card} href={`/dashboard/courses/${course.id}`}>
      <div className={styles.cardThumb}>
        {course.thumbnailUrl ? (
          <Image
            alt=""
            fill
            sizes="(max-width: 700px) 50vw, 200px"
            src={course.thumbnailUrl}
            unoptimized
          />
        ) : (
          <BookOpen size={22} />
        )}
      </div>
      <div className={styles.cardBody}>
        <span
          className={`${styles.cardStatus} ${styles[course.status]}`}
        >
          {course.status === "published" ? (
            <CheckCircle2 size={9} />
          ) : null}
          {course.status}
        </span>
        <p className={styles.cardTitle}>{course.title}</p>
        <p className={styles.cardMeta}>
          {course.moduleCount} module{course.moduleCount === 1 ? "" : "s"} ·{" "}
          {course.lessonCount} lesson{course.lessonCount === 1 ? "" : "s"}
        </p>
        <div className={styles.cardProgress}>
          <span style={{ width: `${completionPct}%` }} />
        </div>
        {course.activeLearnerCount > 0 ? (
          <p className={styles.cardLearners}>
            <Users size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
            {course.activeLearnerCount} active learner
            {course.activeLearnerCount === 1 ? "" : "s"}
          </p>
        ) : (
          <p className={styles.cardLearnersNone}>No learners yet</p>
        )}
      </div>
    </Link>
  );
}

export function CourseManager({
  courses,
  stats,
}: {
  courses: CourseListItem[];
  stats: CourseStats;
}) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus first focusable element in modal on open; return focus on close
  useEffect(() => {
    if (showNewCourse) {
      const first = modalRef.current?.querySelector<HTMLElement>(
        "button, input, select, textarea, [tabindex]",
      );
      first?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [showNewCourse]);

  // Escape key closes modal
  useEffect(() => {
    if (!showNewCourse) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowNewCourse(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showNewCourse]);

  async function createCourse(fd: FormData) {
    setSaving(true);
    setFormError("");
    const response = await fetch("/api/courses", {
      method: "POST",
      body: fd,
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setFormError(payload.error ?? "The course could not be created.");
      return;
    }
    setShowNewCourse(false);
    router.push(`/dashboard/courses/${payload.courseId}`);
    router.refresh();
  }

  const filtered =
    filterStatus === "all"
      ? courses
      : courses.filter((c) => c.status === filterStatus);

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <p className="eyebrow">Content library</p>
          <h1>Courses</h1>
        </div>
        <button
          className={styles.newCourseBtn}
          onClick={() => setShowNewCourse(true)}
          ref={triggerRef}
          type="button"
        >
          <Plus size={14} />
          New course
        </button>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p>Total courses</p>
          <strong>{stats.totalCourses}</strong>
        </div>
        <div className={styles.statCard}>
          <p>Published</p>
          <strong>{stats.published}</strong>
        </div>
        <div className={styles.statCard}>
          <p>Total lessons</p>
          <strong>{stats.totalLessons}</strong>
        </div>
        <div className={styles.statCard}>
          <p>Active learners</p>
          <strong>{stats.activeLearners}</strong>
        </div>
      </div>

      {/* Filter tabs */}
      <div className={styles.filterRow}>
        {FILTERS.map((f) => (
          <button
            aria-pressed={filterStatus === f.value}
            className={
              filterStatus === f.value ? styles.activeFilter : styles.filter
            }
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Course grid or empty state */}
      {courses.length === 0 ? (
        <div className={styles.emptyState}>
          <BookOpen size={32} />
          <h3>No courses yet</h3>
          <p>
            Build your first course — add modules, lessons, and mixed-media
            content to create a learning experience.
          </p>
          <button
            className={styles.emptyStateBtn}
            onClick={() => setShowNewCourse(true)}
            type="button"
          >
            <Plus size={14} />
            Create your first course
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.length === 0 ? (
            <p className={styles.filterEmpty}>
              No {filterStatus} courses.
            </p>
          ) : (
            filtered.map((course) => (
              <CourseLibraryCard key={course.id} course={course} />
            ))
          )}
          <button
            className={styles.addCard}
            onClick={() => setShowNewCourse(true)}
            type="button"
          >
            <Plus size={20} />
            New course
          </button>
        </div>
      )}

      {/* New course modal */}
      {showNewCourse && (
        <div
          className={styles.backdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewCourse(false);
          }}
        >
          <div className={styles.modal} ref={modalRef} role="dialog" aria-modal="true" aria-label="Create new course">
            <div className={styles.modalHeader}>
              <div>
                <p className="eyebrow">Course library</p>
                <h2>Create a course</h2>
              </div>
              <button
                aria-label="Close"
                className={styles.modalClose}
                onClick={() => setShowNewCourse(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <form action={createCourse} className={styles.modalForm}>
              <label>
                Title
                <input maxLength={160} name="title" required />
              </label>
              <label>
                Description
                <textarea maxLength={1200} name="description" />
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
              <label className={styles.uploadLabel}>
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
              {formError ? (
                <p className={styles.formError}>{formError}</p>
              ) : null}
              <button
                className={styles.submitBtn}
                disabled={saving}
                type="submit"
              >
                {saving ? <Loader2 className={styles.spin} size={15} /> : null}
                Create course
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
