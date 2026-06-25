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
}

export interface LessonWithBlocksInput {
  moduleId: string;
  title: string;
  description?: string | null;
  status: "draft" | "published";
  sortOrder: number;
  durationSeconds?: number | null;
  isRequired: boolean;
  blocks: LessonBlockInput[];
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return "Duration not set";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes} min`;
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
