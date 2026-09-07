import { useRef, useState } from "react";
import {
  COURSE_MEDIA_RULES,
  fileTooLargeMessage,
  formatEta,
} from "@/lib/media-limits";
import { readVideoDuration, uploadDirectToStorage } from "@/lib/tus-direct-upload";

export type UploadState = "idle" | "uploading" | "ready" | "error";

export interface UseMediaUploadResult {
  state: UploadState;
  progress: number;
  eta: string | null;
  mediaId: string | null;
  errorMessage: string | null;
  startUpload: (
    file: File,
    mediaType: "video" | "pdf" | "image",
    title?: string,
    replacesMediaId?: string | null,
  ) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
}

type LastUpload = {
  file: File;
  mediaType: "video" | "pdf" | "image";
  title?: string;
  replacesMediaId?: string | null;
};

export function useMediaUpload(): UseMediaUploadResult {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastUpload = useRef<LastUpload | null>(null);

  async function startUpload(
    file: File,
    mediaType: "video" | "pdf" | "image",
    title?: string,
    replacesMediaId?: string | null,
  ) {
    lastUpload.current = { file, mediaType, title, replacesMediaId };
    const rule = COURSE_MEDIA_RULES[mediaType];
    if (file.size > rule.max) {
      setState("error");
      setErrorMessage(fileTooLargeMessage(file, rule.max));
      return;
    }

    setState("uploading");
    setProgress(0);
    setEta(null);
    setMediaId(null);
    setErrorMessage(null);
    const startedAt = Date.now();
    const durationPromise = readVideoDuration(file);

    const init = await fetch("/api/course-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title ?? file.name,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        mediaType,
        replacesMediaId: replacesMediaId ?? null,
      }),
    });
    const payload = await init.json();
    if (!init.ok) {
      setState("error");
      setErrorMessage(payload.error ?? "Upload could not start.");
      return;
    }

    try {
      await uploadDirectToStorage({
        file,
        uploadUrl: payload.uploadUrl,
        bucketName: payload.bucketName,
        objectName: payload.storagePath,
        onProgress: (percent, sent, total) => {
          setProgress(percent);
          setEta(formatEta(sent, total, startedAt));
        },
      });
    } catch {
      setState("error");
      setErrorMessage("Upload paused after a network drop. Retry to resume from where it stopped.");
      return;
    }

    const durationSeconds = await durationPromise;
    const final = await fetch(`/api/course-media/${payload.mediaId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds }),
    });
    const result = await final.json();
    if (!final.ok) {
      setState("error");
      setErrorMessage(result.error ?? "Upload verification failed.");
      return;
    }
    setMediaId(payload.mediaId);
    setProgress(100);
    setEta(null);
    setState("ready");
  }

  async function retry() {
    const pending = lastUpload.current;
    if (!pending) return;
    await startUpload(pending.file, pending.mediaType, pending.title, pending.replacesMediaId);
  }

  function reset() {
    lastUpload.current = null;
    setState("idle");
    setProgress(0);
    setEta(null);
    setMediaId(null);
    setErrorMessage(null);
  }

  return { state, progress, eta, mediaId, errorMessage, startUpload, retry, reset };
}
