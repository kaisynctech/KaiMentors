"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { useMediaUpload } from "@/lib/use-media-upload";
import styles from "./media-block-uploader.module.css";

type Media = {
  id: string;
  title: string;
  media_type: "video" | "pdf" | "image";
  processing_state: string;
};

interface MediaBlockUploaderProps {
  mediaType: "video" | "pdf" | "image";
  availableMedia: Media[];
  value: string | null;
  onChange: (mediaId: string | null) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  onDurationDetected?: (seconds: number) => void;
}

const ACCEPT: Record<"video" | "pdf" | "image", string> = {
  video: "video/mp4,video/webm",
  pdf: "application/pdf",
  image: "image/png,image/jpeg,image/webp",
};

const HINT: Record<"video" | "pdf" | "image", string> = {
  video: "MP4, WebM — up to 500 MB",
  pdf: "PDF — up to 100 MB",
  image: "PNG, JPG, WebP — up to 20 MB",
};

function detectVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const secs = Math.round(video.duration);
      if (isFinite(secs) && secs > 0) resolve(secs);
      else reject(new Error("Unreadable duration"));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video could not be loaded"));
    };
    video.src = url;
  });
}

export function MediaBlockUploader({
  mediaType,
  availableMedia,
  value,
  onChange,
  onUploadStateChange,
  onDurationDetected,
}: MediaBlockUploaderProps) {
  const { state, progress, mediaId, errorMessage, startUpload, reset } = useMediaUpload();
  const [dragging, setDragging] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === "ready" && mediaId) {
      onChange(mediaId);
    }
  }, [state, mediaId]);

  useEffect(() => {
    onUploadStateChange?.(state === "uploading");
  }, [state]);

  async function handleFile(file: File) {
    setUploadingFileName(file.name);
    if (mediaType === "video" && onDurationDetected) {
      detectVideoDuration(file)
        .then(onDurationDetected)
        .catch(() => {
          // metadata unreadable — duration field stays as-is
        });
    }
    await startUpload(file, mediaType);
  }

  const readyLabel =
    value
      ? availableMedia.find((m) => m.id === value)?.title ?? "Selected"
      : "";

  if (state === "uploading") {
    return (
      <div className={styles.uploadingState}>
        <span className={styles.fileName}>{uploadingFileName}</span>
        <div className={styles.progressBar}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressLabel}>{progress}% — Uploading…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={styles.errorState}>
        <span>{errorMessage}</span>
        <button
          className={styles.retryBtn}
          onClick={() => { reset(); onChange(null); }}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <div className={styles.readyState}>
        <CheckCircle2 size={16} />
        <span>{readyLabel}</span>
        <button
          className={styles.changeBtn}
          onClick={() => { reset(); onChange(null); }}
          type="button"
        >
          Change ×
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <UploadCloud size={20} />
        <span>Drop file here or click to browse</span>
        <span className={styles.hint}>{HINT[mediaType]}</span>
        <input
          accept={ACCEPT[mediaType]}
          className={styles.hiddenInput}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          ref={fileRef}
          type="file"
        />
      </div>
      {availableMedia.length > 0 && (
        <>
          <p className={styles.orDivider}>— or choose from Media Library —</p>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          >
            <option disabled value="">
              Select an existing {mediaType}…
            </option>
            {availableMedia.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
}
