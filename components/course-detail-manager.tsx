"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ImagePlus,
  Loader2,
  PlayCircle,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/courses";
import styles from "./course-detail-manager.module.css";

interface CourseDetailManagerProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: "draft" | "published" | "archived";
    sort_order: number;
    thumbnailUrl: string | null;
    access_scope: "all_verified" | "restricted";
  };
  groups: Array<{ id: string; name: string; color: string }>;
  selectedGroupIds: string[];
  lessons: Array<{
    id: string;
    title: string;
    description: string | null;
    status: "draft" | "published" | "archived";
    sort_order: number;
    duration_seconds: number | null;
    video_path: string | null;
  }>;
}

export function CourseDetailManager({
  course,
  groups,
  lessons,
  selectedGroupIds,
}: CourseDetailManagerProps) {
  const router = useRouter();
  const [courseState, setCourseState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [lessonState, setLessonState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function updateCourse(formData: FormData) {
    setCourseState("saving");
    setMessage("");
    setError("");
    const response = await fetch(`/api/courses/${course.id}`, {
      method: "PATCH",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      setCourseState("idle");
      setError(payload.error ?? "The course could not be updated.");
      return;
    }
    setCourseState("saved");
    setMessage("Course updated.");
    router.refresh();
  }

  async function createLesson(formData: FormData) {
    setLessonState("saving");
    setMessage("");
    setError("");
    const response = await fetch(`/api/courses/${course.id}/lessons`, {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      setLessonState("idle");
      setError(payload.error ?? "The lesson could not be created.");
      return;
    }
    setLessonState("saved");
    setMessage("Lesson and video uploaded.");
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <section className={styles.courseEditor}>
        <div className={styles.thumbnail}>
          {course.thumbnailUrl ? (
            <Image
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 420px"
              src={course.thumbnailUrl}
              unoptimized
            />
          ) : (
            <PlayCircle size={38} />
          )}
        </div>
        <form action={updateCourse}>
          <div className={styles.heading}>
            <span>Course settings</span>
            <h2>Edit course</h2>
          </div>
          <label>
            Title
            <input
              defaultValue={course.title}
              maxLength={160}
              name="title"
              required
            />
          </label>
          <label>
            Description
            <textarea
              defaultValue={course.description ?? ""}
              maxLength={1200}
              name="description"
              rows={4}
            />
          </label>
          <div className={styles.twoColumns}>
            <label>
              Status
              <select defaultValue={course.status} name="status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Sort order
              <input
                defaultValue={course.sort_order}
                min="0"
                name="sortOrder"
                type="number"
              />
            </label>
          </div>
          <fieldset className={styles.access}>
            <legend>Student access</legend>
            <label className={styles.accessOption}>
              <input
                defaultChecked={course.access_scope === "all_verified"}
                name="accessScope"
                type="radio"
                value="all_verified"
              />
              <span>
                <strong>All verified students</strong>
                <small>Keep this course available across the academy.</small>
              </span>
            </label>
            <label className={styles.accessOption}>
              <input
                defaultChecked={course.access_scope === "restricted"}
                name="accessScope"
                type="radio"
                value="restricted"
              />
              <span>
                <strong>Selected student groups</strong>
                <small>Only assigned audiences can discover and open it.</small>
              </span>
            </label>
            <div className={styles.groupChoices}>
              {groups.map((group) => (
                <label key={group.id}>
                  <input
                    defaultChecked={selectedGroupIds.includes(group.id)}
                    name="groupIds"
                    type="checkbox"
                    value={group.id}
                  />
                  <span style={{ background: group.color }} />
                  {group.name}
                </label>
              ))}
              {!groups.length ? (
                <p>
                  Create a student group before restricting this course.
                </p>
              ) : null}
            </div>
          </fieldset>
          <label className={styles.upload}>
            <ImagePlus size={19} />
            <span>
              <strong>Replace thumbnail</strong>
              <small>Optional PNG, JPG, or WebP up to 5 MB.</small>
            </span>
            <input
              accept="image/png,image/jpeg,image/webp"
              name="thumbnail"
              type="file"
            />
          </label>
          <button disabled={courseState === "saving"} type="submit">
            {courseState === "saving" ? (
              <Loader2 className={styles.spin} size={18} />
            ) : null}
            Save course
          </button>
        </form>
      </section>

      <section className={styles.lessonCreate}>
        <div className={styles.heading}>
          <span>Video lesson</span>
          <h2>Upload a lesson</h2>
          <p>
            Videos remain private and are streamed with short-lived signed URLs.
          </p>
        </div>
        <form action={createLesson}>
          <label>
            Lesson title
            <input maxLength={180} name="title" required />
          </label>
          <label>
            Description
            <textarea maxLength={1200} name="description" rows={3} />
          </label>
          <div className={styles.threeColumns}>
            <label>
              Duration (minutes)
              <input
                min="0.1"
                name="durationMinutes"
                required
                step="0.1"
                type="number"
              />
            </label>
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
            <UploadCloud size={19} />
            <span>
              <strong>Lesson video</strong>
              <small>MP4 or WebM up to 500 MB.</small>
            </span>
            <input
              accept="video/mp4,video/webm"
              name="video"
              required
              type="file"
            />
          </label>
          <button disabled={lessonState === "saving"} type="submit">
            {lessonState === "saving" ? (
              <Loader2 className={styles.spin} size={18} />
            ) : null}
            Create lesson and upload video
          </button>
        </form>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? (
        <p className={styles.success}>
          <CheckCircle2 size={17} /> {message}
        </p>
      ) : null}

      <section className={styles.lessons}>
        <div className={styles.lessonsHeading}>
          <div>
            <span>Course curriculum</span>
            <h2>{lessons.length} lesson{lessons.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
        {lessons.length ? (
          <div className={styles.lessonList}>
            {lessons.map((lesson) => (
              <article key={lesson.id}>
                <div className={styles.lessonOrder}>{lesson.sort_order}</div>
                <div>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.description || "No description provided."}</p>
                  <span>
                    {formatDuration(lesson.duration_seconds)} ·{" "}
                    {lesson.video_path ? "Video uploaded" : "No video"}
                  </span>
                </div>
                <span className={styles[lesson.status]}>
                  {lesson.status === "published" ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <Clock3 size={12} />
                  )}
                  {lesson.status}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <PlayCircle size={28} />
            <h3>No video lessons yet</h3>
            <p>Upload the first lesson using the form above.</p>
          </div>
        )}
      </section>
    </div>
  );
}
