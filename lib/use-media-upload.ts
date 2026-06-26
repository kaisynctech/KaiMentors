import { useState } from "react";
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/browser";

export type UploadState = "idle" | "uploading" | "ready" | "error";

export interface UseMediaUploadResult {
  state: UploadState;
  progress: number;
  mediaId: string | null;
  errorMessage: string | null;
  startUpload: (
    file: File,
    mediaType: "video" | "pdf" | "image",
    title?: string,
    replacesMediaId?: string | null,
  ) => Promise<void>;
  reset: () => void;
}

export function useMediaUpload(): UseMediaUploadResult {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startUpload(
    file: File,
    mediaType: "video" | "pdf" | "image",
    title?: string,
    replacesMediaId?: string | null,
  ) {
    setState("uploading");
    setProgress(0);
    setMediaId(null);
    setErrorMessage(null);

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

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setState("error");
      setErrorMessage("Your session expired. Sign in and retry.");
      return;
    }

    const upload = new Upload(file, {
      endpoint: payload.uploadUrl,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: payload.bucketName,
        objectName: payload.storagePath,
        contentType: file.type,
        cacheControl: "private, max-age=0",
      },
      chunkSize: 6 * 1024 * 1024,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
      onError: () => {
        setState("error");
        setErrorMessage("Upload paused after repeated network failures. Retry to resume.");
      },
      onSuccess: async () => {
        const final = await fetch(`/api/course-media/${payload.mediaId}/finalize`, {
          method: "POST",
        });
        const result = await final.json();
        if (!final.ok) {
          setState("error");
          setErrorMessage(result.error ?? "Upload verification failed.");
          return;
        }
        setMediaId(payload.mediaId);
        setState("ready");
      },
    });

    const previous = await upload.findPreviousUploads();
    if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  }

  function reset() {
    setState("idle");
    setProgress(0);
    setMediaId(null);
    setErrorMessage(null);
  }

  return { state, progress, mediaId, errorMessage, startUpload, reset };
}
