"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { LessonBlockInput, LessonWithBlocksInput } from "@/lib/courses";
import { MediaBlockUploader } from "@/components/media-block-uploader";
import { MediaBlockGalleryUploader } from "@/components/media-block-gallery-uploader";
import styles from "../course-detail-manager.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; processing_state: string };
type Module = { id: string; title: string };

interface FetchedLesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  durationSeconds: number | null;
  isRequired: boolean;
  blocks: LessonBlockInput[];
}

interface EditLessonPanelProps {
  courseId: string;
  lessonId: string;
  modules: Module[];
  readyMedia: Media[];
  busy: boolean;
  onSubmit: (lessonId: string, lesson: LessonWithBlocksInput) => Promise<void>;
  onCancel: () => void;
}

const BLOCK_TYPE_LABELS: Record<LessonBlockInput["blockType"], string> = {
  rich_text: "Written text",
  video: "Video",
  pdf: "PDF",
  image: "Image",
  gallery: "Gallery",
  link: "Link",
};

const BLOCK_TYPES = ["rich_text", "video", "pdf", "image", "gallery", "link"] as const;

export function EditLessonPanel({
  courseId,
  lessonId,
  modules,
  readyMedia,
  busy,
  onSubmit,
  onCancel,
}: EditLessonPanelProps) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<FetchedLesson | null>(null);
  const [blocks, setBlocks] = useState<LessonBlockInput[]>([]);
  const [uploadingBlocks, setUploadingBlocks] = useState<Set<number>>(new Set());
  const durationRef = useRef<HTMLInputElement>(null);

  function handleDurationDetected(seconds: number) {
    if (durationRef.current) {
      durationRef.current.value = String(Math.max(1, Math.round(seconds / 60)));
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFetchError(null);
    setInitialData(null);
    setBlocks([]);
    fetch(`/api/courses/${courseId}/lessons/${lessonId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: FetchedLesson) => {
        if (!active) return;
        setInitialData(data);
        setBlocks(data.blocks);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFetchError("Could not load lesson details. Please try again.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [courseId, lessonId]);

  function appendBlock(blockType: LessonBlockInput["blockType"]) {
    setBlocks((prev) => [...prev, { blockType, sortOrder: prev.length }]);
  }

  function removeBlock(index: number) {
    setBlocks((prev) =>
      prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sortOrder: i })),
    );
    setUploadingBlocks((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  }

  function updateBlock(index: number, updates: Partial<LessonBlockInput>) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...updates } : b)),
    );
  }

  function handleUploadStateChange(key: number, uploading: boolean) {
    setUploadingBlocks((prev) => {
      const next = new Set(prev);
      if (uploading) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!initialData) return;
    const fd = new FormData(e.currentTarget);
    const durationMinutes = Number(fd.get("durationMinutes")) || null;
    await onSubmit(lessonId, {
      moduleId: String(fd.get("moduleId")),
      title: String(fd.get("title")),
      description: String(fd.get("description")) || null,
      status: fd.get("status") as "draft" | "published" | "archived",
      sortOrder: Number(fd.get("sortOrder")),
      durationSeconds: durationMinutes ? durationMinutes * 60 : null,
      isRequired: fd.get("isRequired") === "on",
      blocks,
    });
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <p className={styles.panelLoading}>Loading lesson…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={styles.panel}>
        <p className={styles.panelError}>{fetchError}</p>
        <button className={styles.ghostBtn} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    );
  }

  if (!initialData) return null;

  const videos = readyMedia.filter((m) => m.media_type === "video");
  const pdfs = readyMedia.filter((m) => m.media_type === "pdf");
  const images = readyMedia.filter((m) => m.media_type === "image");
  const durationMinutesDefault = initialData.durationSeconds
    ? Math.round(initialData.durationSeconds / 60) || ""
    : "";

  return (
    <form key={initialData.id} onSubmit={handleSubmit} className={styles.panel}>
      <div className={styles.panelTitleRow}>
        <h3><Pencil size={15} /> Edit lesson</h3>
        <button
          aria-label="Cancel editing"
          className={styles.iconBtn}
          onClick={onCancel}
          type="button"
        >
          <X size={15} />
        </button>
      </div>

      <label>
        Module
        <select name="moduleId" required defaultValue={initialData.moduleId}>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" required defaultValue={initialData.title} />
      </label>
      <label>
        Description
        <textarea name="description" defaultValue={initialData.description ?? ""} />
      </label>
      <div className={styles.columns}>
        <label>
          Status
          <select name="status" defaultValue={initialData.status}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          Order
          <input defaultValue={initialData.sortOrder} min="0" name="sortOrder" type="number" />
        </label>
      </div>
      <label>
        Duration (minutes)
        <input
          defaultValue={durationMinutesDefault}
          min="1"
          name="durationMinutes"
          ref={durationRef}
          type="number"
        />
      </label>
      <label className={styles.check}>
        <input
          defaultChecked={initialData.isRequired}
          name="isRequired"
          type="checkbox"
        />{" "}
        Required
      </label>

      <div className={styles.blockChips}>
        {BLOCK_TYPES.map((type) => (
          <button
            className={styles.chipBtn}
            key={type}
            onClick={() => appendBlock(type)}
            type="button"
          >
            <Plus size={11} /> {BLOCK_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {blocks.map((block, index) => (
        <div className={styles.blockCard} key={index}>
          <div className={styles.blockCardHeader}>
            <strong>{BLOCK_TYPE_LABELS[block.blockType]}</strong>
            <button
              className={styles.removeBtn}
              onClick={() => removeBlock(index)}
              type="button"
            >
              <X size={12} /> Remove
            </button>
          </div>

          {block.blockType === "rich_text" && (
            <label>
              Content
              <textarea
                onChange={(e) => updateBlock(index, { text: e.target.value })}
                placeholder="Enter written content…"
                value={block.text ?? ""}
              />
            </label>
          )}

          {block.blockType === "video" && (
            <MediaBlockUploader
              availableMedia={videos}
              mediaType="video"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onDurationDetected={handleDurationDetected}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "pdf" && (
            <MediaBlockUploader
              availableMedia={pdfs}
              mediaType="pdf"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "image" && (
            <MediaBlockUploader
              availableMedia={images}
              mediaType="image"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "gallery" && (
            <MediaBlockGalleryUploader
              availableImages={images}
              onChange={(ids) => updateBlock(index, { galleryMediaIds: ids })}
              onUploadStateChange={(slotIndex, uploading) =>
                handleUploadStateChange(index * 1000 + slotIndex, uploading)
              }
              value={block.galleryMediaIds ?? []}
            />
          )}

          {block.blockType === "link" && (
            <>
              <label>
                URL
                <input
                  onChange={(e) => updateBlock(index, { url: e.target.value })}
                  placeholder="https://…"
                  type="url"
                  value={block.url ?? ""}
                />
              </label>
              <label>
                Label
                <input
                  onChange={(e) => updateBlock(index, { label: e.target.value })}
                  placeholder="Link text"
                  value={block.label ?? ""}
                />
              </label>
            </>
          )}
        </div>
      ))}

      <div className={styles.panelActions}>
        <button
          disabled={busy || !modules.length || uploadingBlocks.size > 0}
          type="submit"
        >
          Save changes{blocks.length > 0 ? ` · ${blocks.length} block${blocks.length === 1 ? "" : "s"}` : ""}
        </button>
        <button className={styles.ghostBtn} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
