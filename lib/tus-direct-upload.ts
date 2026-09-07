import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/browser";
import { TUS_CHUNK_SIZE, TUS_RETRY_DELAYS } from "@/lib/media-limits";

export async function uploadDirectToStorage(options: {
  file: File;
  uploadUrl: string;
  bucketName: string;
  objectName: string;
  upsert?: boolean;
  onProgress?: (percent: number, sent: number, total: number) => void;
}) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session expired. Sign in and retry.");
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(options.file, {
      endpoint: options.uploadUrl,
      retryDelays: TUS_RETRY_DELAYS,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": options.upsert ? "true" : "false",
      },
      metadata: {
        bucketName: options.bucketName,
        objectName: options.objectName,
        contentType: options.file.type,
        cacheControl: "private, max-age=0",
      },
      chunkSize: TUS_CHUNK_SIZE,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => {
        options.onProgress?.(Math.round((sent / total) * 100), sent, total);
      },
      onError: (error) => {
        reject(error instanceof Error ? error : new Error("Upload paused after repeated network failures. Retry to resume."));
      },
      onSuccess: () => resolve(),
    });

    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}

export function readVideoDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith("video/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const secs = Math.round(video.duration);
      resolve(Number.isFinite(secs) && secs > 0 ? secs : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}
