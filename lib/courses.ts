export interface LessonBlockInput {
  blockType: "rich_text" | "video" | "pdf" | "image" | "gallery" | "link";
  sortOrder: number;
  mediaId?: string | null;
  galleryMediaIds?: string[];
  text?: string;
  url?: string;
  label?: string;
  caption?: string;
  isRequired?: boolean;
  _clientKey?: string; // React key only — never sent to the API
}

export interface LessonWithBlocksInput {
  moduleId: string;
  title: string;
  description?: string | null;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  durationSeconds?: number | null;
  isRequired: boolean;
  blocks: LessonBlockInput[];
}

const FILE_BLOCK_TYPES = new Set(["video", "pdf", "image"]);

export function lessonBlockNeedsMedia(block: LessonBlockInput): boolean {
  if (FILE_BLOCK_TYPES.has(block.blockType)) return !block.mediaId;
  if (block.blockType === "gallery") {
    return !(block.galleryMediaIds ?? []).some((id) => Boolean(id));
  }
  return false;
}

export function serializeLessonBlocks(blocks: LessonBlockInput[]): LessonBlockInput[] {
  return blocks.map((block) => {
    const rest = { ...block };
    delete rest._clientKey;
    return {
      ...rest,
      galleryMediaIds: rest.galleryMediaIds?.filter(Boolean),
    };
  });
}

export function lessonDurationFromVideoMedia(
  blocks: Array<{ blockType: string; mediaId?: string | null }>,
  media: Array<{ id: string; duration_seconds: number | null }>,
): number | null {
  const byId = new Map(media.map((item) => [item.id, item.duration_seconds]));
  let total = 0;
  for (const block of blocks) {
    if (block.blockType !== "video" || !block.mediaId) continue;
    const seconds = byId.get(block.mediaId);
    if (typeof seconds === "number" && seconds > 0) total += seconds;
  }
  if (total < 1) return null;
  return Math.min(total, 86400);
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return "Duration not set";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes} min`;
}

export function formatWatchPosition(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 1) return null;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "Some time ago";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
