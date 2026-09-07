export const COURSE_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const COURSE_PDF_MAX_BYTES = 100 * 1024 * 1024;
export const COURSE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const ACADEMY_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const ACADEMY_PDF_MAX_BYTES = 100 * 1024 * 1024;
export const ACADEMY_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/** Signed lesson URLs last long enough for a 60-minute video plus pauses. */
export const COURSE_MEDIA_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const COURSE_MEDIA_SESSION_REFRESH_BEFORE_SECONDS = 5 * 60;

/** Same-origin MP4 ranges for HLS-style chunked playback. */
export const COURSE_MEDIA_RANGE_MAX_BYTES = 8 * 1024 * 1024;
export const COURSE_MEDIA_RANGE_CHUNK_BYTES = 1024 * 1024;
export const COURSE_VIDEO_BUFFER_AHEAD_SECONDS = 25;

export function parseCourseMediaByteRange(startRaw: string | null, endRaw: string | null) {
  if (startRaw == null || endRaw == null) return null;
  if (!/^\d+$/.test(startRaw) || !/^\d+$/.test(endRaw)) return null;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || end < start) return null;
  const length = end - start + 1;
  if (length > COURSE_MEDIA_RANGE_MAX_BYTES) return null;
  return { start, end, length };
}

/** Page-load signed URLs for resources, community, and broker walkthroughs. */
export const ACADEMY_MEDIA_SIGNED_TTL_SECONDS = 4 * 60 * 60;

/** Supabase TUS requires 6 MB chunks. */
export const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
export const TUS_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000, 30000];

export const COURSE_MEDIA_RULES = {
  video: {
    types: ["video/mp4", "video/webm"] as const,
    extensions: ["mp4", "webm"] as const,
    max: COURSE_VIDEO_MAX_BYTES,
    hint: "MP4 or WebM, up to 2 GB (about 60 minutes at 1080p)",
  },
  pdf: {
    types: ["application/pdf"] as const,
    extensions: ["pdf"] as const,
    max: COURSE_PDF_MAX_BYTES,
    hint: "PDF — up to 100 MB",
  },
  image: {
    types: ["image/png", "image/jpeg", "image/webp"] as const,
    extensions: ["png", "jpg", "jpeg", "webp"] as const,
    max: COURSE_IMAGE_MAX_BYTES,
    hint: "PNG, JPG, WebP — up to 20 MB",
  },
} as const;

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.max(0.1, bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatEta(sent: number, total: number, startedAt: number) {
  if (sent <= 0 || total <= sent) return null;
  const elapsed = Date.now() - startedAt;
  if (elapsed < 2000) return null;
  const remainingMs = (elapsed / sent) * (total - sent);
  const seconds = Math.round(remainingMs / 1000);
  if (seconds < 60) return `about ${seconds}s left`;
  return `about ${Math.round(seconds / 60)} min left`;
}

export function fileTooLargeMessage(file: { name: string; size: number }, max: number) {
  return `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(max)}. Export a 1080p H.264 MP4 if this is a long recording.`;
}

export function maxBytesForAcademyUpload(contentType: string) {
  if (contentType.startsWith("video/")) return ACADEMY_VIDEO_MAX_BYTES;
  if (contentType === "application/pdf") return ACADEMY_PDF_MAX_BYTES;
  return ACADEMY_IMAGE_MAX_BYTES;
}
