import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonDurationFromVideoMedia } from "@/lib/courses";

type LessonBlock = {
  blockType: string;
  mediaId?: string | null;
  galleryMediaIds?: string[];
};

export async function ownedMediaDurationForLesson(
  supabase: SupabaseClient,
  traderId: string,
  blocks: LessonBlock[],
): Promise<
  | { ok: true; durationSeconds: number | null }
  | { ok: false; error: string }
> {
  const allMediaIds = [
    ...new Set([
      ...blocks.flatMap((block) => (block.mediaId ? [block.mediaId] : [])),
      ...blocks.flatMap((block) => block.galleryMediaIds ?? []),
    ]),
  ];
  if (allMediaIds.length === 0) {
    return { ok: true, durationSeconds: lessonDurationFromVideoMedia(blocks, []) };
  }
  const { data, error } = await supabase
    .from("course_media")
    .select("id, duration_seconds")
    .in("id", allMediaIds)
    .eq("trader_id", traderId);
  if (error) return { ok: false, error: "Media could not be verified." };
  const rows = (data ?? []) as Array<{ id: string; duration_seconds: number | null }>;
  if (rows.length !== allMediaIds.length) {
    return { ok: false, error: "One or more media assets do not belong to this workspace." };
  }
  return { ok: true, durationSeconds: lessonDurationFromVideoMedia(blocks, rows) };
}
