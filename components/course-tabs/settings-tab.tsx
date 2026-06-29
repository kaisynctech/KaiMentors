"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import Image from "next/image";
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
  thumbnailUrl: string | null;
  busy: boolean;
  saveCourse: (fd: FormData) => Promise<void>;
}

export function SettingsTab({ course, thumbnailUrl, busy, saveCourse }: Props) {
  const [removeThumb, setRemoveThumb] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setRemoveThumb(false);
      setPreview(URL.createObjectURL(file));
    }
  }

  const displayUrl = removeThumb ? null : (preview ?? thumbnailUrl);

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

        {/* ── Thumbnail ─────────────────────────────── */}
        <div className={styles.thumbnailField}>
          <span className={styles.fieldLabel}>Cover image</span>
          {displayUrl ? (
            <div className={styles.thumbnailPreview}>
              <Image
                alt="Course cover"
                fill
                sizes="160px"
                src={displayUrl}
                style={{ objectFit: "cover" }}
                unoptimized
              />
              <button
                aria-label="Remove thumbnail"
                className={styles.thumbnailRemoveBtn}
                onClick={() => { setRemoveThumb(true); setPreview(null); }}
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className={styles.thumbnailUploadArea} htmlFor="thumbnail-input">
              <ImagePlus size={20} />
              <span>Upload cover image</span>
              <span className={styles.thumbnailHint}>PNG, JPG or WebP · max 5 MB</span>
            </label>
          )}
          <input
            accept="image/png,image/jpeg,image/webp"
            className={styles.thumbnailInput}
            id="thumbnail-input"
            name="thumbnail"
            onChange={handleFileChange}
            type="file"
          />
          <input name="removeThumbnail" type="hidden" value={removeThumb ? "true" : "false"} />
        </div>
        {/* ── End thumbnail ─────────────────────────── */}

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
