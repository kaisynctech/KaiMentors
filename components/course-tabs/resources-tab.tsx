"use client";

import styles from "../course-detail-manager.module.css";

type Status = "draft" | "published" | "archived";

interface Resource {
  id: string;
  title: string;
  status: Status;
  sort_order: number;
}

interface Lesson {
  id: string;
  title: string;
}

interface Media {
  id: string;
  title: string;
  media_type: "video" | "pdf" | "image";
  processing_state: string;
}

interface Props {
  course: { id: string };
  resources: Resource[];
  lessons: Lesson[];
  readyMedia: Media[];
  busy: boolean;
  addResource: (fd: FormData) => Promise<void>;
}

export function ResourcesTab({ course, resources, lessons, readyMedia, busy, addResource }: Props) {
  return (
    <div className={styles.split}>
      <section className={styles.panel}>
        <header>
          <div>
            <p className="eyebrow">Supporting material</p>
            <h2>Course resources</h2>
          </div>
        </header>
        {resources.length === 0 ? (
          <p className={styles.empty}>No supporting resources yet.</p>
        ) : (
          resources.map((r) => (
            <div className={styles.resourceRow} key={r.id}>
              <span className={styles.resourceTitle}>{r.title}</span>
              <span
                className={`${styles.resourceStatus} ${styles[r.status]}`}
              >
                {r.status}
              </span>
            </div>
          ))
        )}
      </section>

      <form action={addResource} className={styles.panel}>
        <h3>Add supporting resource</h3>
        <label>
          Title
          <input name="title" required />
        </label>
        <label>
          Attach to lesson
          <select name="lessonId">
            <option value="">Whole course</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Protected media
          <select name="mediaId">
            <option value="">None</option>
            {readyMedia.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.media_type})
              </option>
            ))}
          </select>
        </label>
        <label>
          Or external URL
          <input name="externalUrl" type="url" />
        </label>
        <div className={styles.columns}>
          <label>
            Status
            <select name="status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label>
            Order
            <input defaultValue="0" min="0" name="sortOrder" type="number" />
          </label>
        </div>
        <button disabled={busy} type="submit">
          Add resource
        </button>
      </form>
    </div>
  );
}
