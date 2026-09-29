import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/browser";
import {
  TUS_CHUNK_SIZE,
  TUS_RETRY_DELAYS,
  resolveUploadContentType,
} from "@/lib/media-limits";

export function storageUploadErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLowerCase();
  if (
    lower.includes("413") ||
    lower.includes("maximum size exceeded") ||
    lower.includes("entity too large")
  ) {
    return "This video is larger than Storage currently allows. Set the Global file size limit to 2 GB in Supabase Storage Settings, then retry.";
  }
  if (
    lower.includes("401") ||
    lower.includes("jwt") ||
    lower.includes("session expired")
  ) {
    return "Your session expired. Sign in and retry.";
  }
  if (lower.includes("403")) {
    return "You do not have permission to upload to this academy.";
  }
  if (lower.includes("415") || lower.includes("mime")) {
    return "This file type is not allowed. Export an H.264 MP4 and retry.";
  }
  if (lower.includes("409") || lower.includes("conflict")) {
    return "This file is already being uploaded. Wait a moment and retry.";
  }
  return "Upload paused after a network drop. Retry to resume from where it stopped.";
}

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
      uploadDataDuringCreation: true,
      metadata: {
        bucketName: options.bucketName,
        objectName: options.objectName,
        contentType: resolveUploadContentType(options.file),
        cacheControl: "3600",
      },
      chunkSize: TUS_CHUNK_SIZE,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => {
        options.onProgress?.(Math.round((sent / total) * 100), sent, total);
      },
      onError: (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
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
