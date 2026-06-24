"use client";

import styles from "../course-detail-manager.module.css";

type Status = "draft" | "published" | "archived";
type AccessMode = "all_verified" | "restricted" | "one_to_one";

interface Props {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: Status;
    sort_order: number;
    access_mode: AccessMode;
  };
  busy: boolean;
  saveCourse: (fd: FormData) => Promise<void>;
}

export function SettingsTab({ course, busy, saveCourse }: Props) {
  return (
    <div className={styles.panel}>
      <header>
        <div>
          <p className="eyebrow">Course lifecycle</p>
          <h2>Settings</h2>
          <p>Publishing, archiving, and reordering active curriculum requires confirmation.</p>
        </div>
      </header>

      <form action={saveCourse} className={styles.settingsForm}>
        <label>
          Title
          <input defaultValue={course.title} name="title" required />
        </label>
        <label>
          Description
          <textarea defaultValue={course.description ?? ""} name="description" />
        </label>
        <div className={styles.columns}>
          <label>
            Status
            <select defaultValue={course.status} name="status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Order
            <input defaultValue={course.sort_order} min="0" name="sortOrder" type="number" />
          </label>
        </div>
        <input name="acknowledgeImpact" type="hidden" value="false" />
        <div className={styles.settingsActions}>
          <button disabled={busy} type="submit">
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
