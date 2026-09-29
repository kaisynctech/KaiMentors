"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { LessonBlockInput, LessonWithBlocksInput } from "@/lib/courses";
import { lessonBlockNeedsMedia, serializeLessonBlocks } from "@/lib/courses";
import { MediaBlockUploader } from "@/components/media-block-uploader";
import { MediaBlockGalleryUploader } from "@/components/media-block-gallery-uploader";
import { RichTextEditor } from "@/components/rich-text-editor";
import styles from "../course-detail-manager.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; processing_state: string };
type Module = { id: string; title: string };

interface AddLessonPanelProps {
  modules: Module[];
  defaultModuleId: string | null;
  readyMedia: Media[];
  busy: boolean;
  onSubmit: (lesson: LessonWithBlocksInput) => Promise<boolean>;
  onMediaReady?: (media: Media) => void;
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

function mergeMedia(current: Media[], extra: Media[]): Media[] {
  const seen = new Set(current.map((item) => item.id));
  const prepend: Media[] = [];
  for (const item of extra) {
    if (seen.has(item.id) || item.processing_state !== "ready") continue;
    seen.add(item.id);
    prepend.push(item);
  }
  return prepend.length ? [...prepend, ...current] : current;
}

export function AddLessonPanel({
  modules,
  defaultModuleId,
  readyMedia,
  busy,
  onSubmit,
  onMediaReady,
}: AddLessonPanelProps) {
  const [blocks, setBlocks] = useState<LessonBlockInput[]>([]);
  const [uploadingBlocks, setUploadingBlocks] = useState<Set<number>>(new Set());
  const [libraryMedia, setLibraryMedia] = useState<Media[]>(readyMedia);
  const [moduleId, setModuleId] = useState(defaultModuleId ?? modules[0]?.id ?? "");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setLibraryMedia((prev) => mergeMedia(readyMedia, prev));
  }, [readyMedia]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/course-media")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { media?: Media[] }) => {
        if (cancelled) return;
        setLibraryMedia((prev) => mergeMedia(prev, payload.media ?? []));
      })
      .catch(() => {
        // Keep the page-loaded library if the refresh fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function rememberMedia(media: Media) {
    setLibraryMedia((prev) => mergeMedia(prev, [media]));
    onMediaReady?.(media);
  }

  const videos = libraryMedia.filter((m) => m.media_type === "video");
  const pdfs = libraryMedia.filter((m) => m.media_type === "pdf");
  const images = libraryMedia.filter((m) => m.media_type === "image");

  function appendBlock(blockType: LessonBlockInput["blockType"]) {
    setBlocks((prev) => [
      ...prev,
      { blockType, sortOrder: prev.length, _clientKey: crypto.randomUUID() },
    ]);
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

  function handleUploadStateChange(key: number, uploading: boolean) {
    setUploadingBlocks((prev) => {
      const next = new Set(prev);
      if (uploading) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function updateBlock(index: number, updates: Partial<LessonBlockInput>) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...updates } : b)),
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    if (blocks.some(lessonBlockNeedsMedia)) {
      setFormError("Upload a file or choose one from the library for every video, PDF, or image block, then click Create lesson.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const ok = await onSubmit({
      moduleId: String(fd.get("moduleId")),
      title: String(fd.get("title")),
      description: String(fd.get("description")) || null,
      status: fd.get("status") as "draft" | "published",
      sortOrder: Number(fd.get("sortOrder")),
      isRequired: fd.get("isRequired") === "on",
      blocks: serializeLessonBlocks(blocks),
    });
    if (!ok) {
      setFormError("The lesson could not be saved. Check the error above and try again.");
    }
  }

  const hasAttachedFile = blocks.some(
    (block) => Boolean(block.mediaId) || (block.galleryMediaIds ?? []).some(Boolean),
  );

  return (
    <form onSubmit={handleSubmit} className={styles.panel}>
      <h3>
        <Plus size={15} /> Add lesson
      </h3>

      <label>
        Module
        <select
          name="moduleId"
          onChange={(e) => setModuleId(e.target.value)}
          required
          value={moduleId}
        >
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" required />
      </label>
      <label>
        Description
        <textarea name="description" />
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
      <label className={styles.check}>
        <input defaultChecked name="isRequired" type="checkbox" /> Required
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
        <div className={styles.blockCard} key={block._clientKey ?? index}>
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
              <RichTextEditor
                defaultContent={block.text ?? ""}
                onChange={(html) => updateBlock(index, { text: html })}
              />
            </label>
          )}

          {block.blockType === "video" && (
            <MediaBlockUploader
              availableMedia={videos}
              mediaType="video"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onMediaReady={rememberMedia}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "pdf" && (
            <MediaBlockUploader
              availableMedia={pdfs}
              mediaType="pdf"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onMediaReady={rememberMedia}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "image" && (
            <MediaBlockUploader
              availableMedia={images}
              mediaType="image"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onMediaReady={rememberMedia}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "gallery" && (
            <MediaBlockGalleryUploader
              availableImages={images}
              onChange={(ids) => updateBlock(index, { galleryMediaIds: ids })}
              onMediaReady={rememberMedia}
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

      {hasAttachedFile ? (
        <p className={styles.submitHint}>
          The file is uploaded. Click <strong>Create lesson</strong> to add it under this module.
        </p>
      ) : null}
      {formError ? <p className={styles.panelInlineError}>{formError}</p> : null}

      <button disabled={busy || !modules.length || uploadingBlocks.size > 0} type="submit">
        Create lesson
        {blocks.length > 0 ? ` with ${blocks.length} block${blocks.length === 1 ? "" : "s"}` : ""}
      </button>
    </form>
  );
}
