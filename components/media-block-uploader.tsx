"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { COURSE_MEDIA_RULES } from "@/lib/media-limits";
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
  onMediaReady?: (media: Media) => void;
}

const ACCEPT: Record<"video" | "pdf" | "image", string> = {
  video: COURSE_MEDIA_RULES.video.types.join(","),
  pdf: COURSE_MEDIA_RULES.pdf.types.join(","),
  image: COURSE_MEDIA_RULES.image.types.join(","),
};

const HINT: Record<"video" | "pdf" | "image", string> = {
  video: COURSE_MEDIA_RULES.video.hint,
  pdf: COURSE_MEDIA_RULES.pdf.hint,
  image: COURSE_MEDIA_RULES.image.hint,
};

export function MediaBlockUploader({
  mediaType,
  availableMedia,
  value,
  onChange,
  onUploadStateChange,
  onMediaReady,
}: MediaBlockUploaderProps) {
  const { state, progress, eta, mediaId, errorMessage, startUpload, retry, reset } = useMediaUpload();
  const [dragging, setDragging] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (state === "ready" && mediaId) {
      onChangeRef.current(mediaId);
    }
  }, [state, mediaId]);

  useEffect(() => {
    onUploadStateChange?.(state === "uploading");
  }, [state]);

  function attachReadyMedia(id: string, title: string) {
    onChange(id);
    onMediaReady?.({
      id,
      title,
      media_type: mediaType,
      processing_state: "ready",
    });
  }

  async function handleFile(file: File) {
    setUploadingFileName(file.name);
    const id = await startUpload(file, mediaType);
    if (id) attachReadyMedia(id, file.name);
  }

  const selectedId = value ?? (state === "ready" ? mediaId : null);
  const readyLabel = selectedId
    ? availableMedia.find((m) => m.id === selectedId)?.title ?? uploadingFileName ?? "Selected"
    : "";

  if (state === "uploading") {
    return (
      <div className={styles.uploadingState}>
        <span className={styles.fileName}>{uploadingFileName}</span>
        <div className={styles.progressBar}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressLabel}>{progress}% — {eta ?? "Uploading…"}</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={styles.errorState}>
        <span>{errorMessage}</span>
        <button
          className={styles.retryBtn}
          onClick={() => {
            void retry().then((id) => {
              if (id) attachReadyMedia(id, uploadingFileName || "Uploaded file");
            });
          }}
          type="button"
        >
          Resume upload
        </button>
      </div>
    );
  }

  if (selectedId) {
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
          if (file) void handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <UploadCloud size={20} />
        <span>Drop file here or click to browse</span>
        <span className={styles.hint}>{HINT[mediaType]}</span>
        <input
          accept={ACCEPT[mediaType]}
          className={styles.hiddenInput}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          ref={fileRef}
          type="file"
        />
      </div>
      {availableMedia.length > 0 && (
        <>
          <p className={styles.orDivider}>— or choose from Media Library —</p>
          <select
            value=""
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
