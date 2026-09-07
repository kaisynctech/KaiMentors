import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type CourseMediaRangeTarget = {
  storagePath: string;
  mimeType: string;
  sizeBytes: number | null;
};

export async function authorizeCourseMediaRange(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<CourseMediaRangeTarget | null> {
  const { data: existing } = await supabase
    .from("course_media_access_sessions")
    .select("id")
    .eq("media_id", mediaId)
    .eq("student_user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const { data, error } = await supabase.rpc("issue_course_media_session", {
      target_media_id: mediaId,
    });
    if (error || !data) return null;
    const evidence = data as { storage_path: string; mime_type: string };
    const { data: media } = await supabase
      .from("course_media")
      .select("size_bytes")
      .eq("id", mediaId)
      .maybeSingle();
    return {
      storagePath: evidence.storage_path,
      mimeType: evidence.mime_type,
      sizeBytes: media?.size_bytes ?? null,
    };
  }

  const { data: media } = await supabase
    .from("course_media")
    .select("storage_path,mime_type,size_bytes")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media?.storage_path) return null;
  return {
    storagePath: media.storage_path,
    mimeType: media.mime_type,
    sizeBytes: media.size_bytes,
  };
}

export async function fetchCourseMediaRange(
  target: CourseMediaRangeTarget,
  start: number,
  end: number,
) {
  const admin = createAdminClient();
  if (!admin) return { ok: false as const, status: 503 };
  const { data: signed } = await admin.storage
    .from("course-content")
    .createSignedUrl(target.storagePath, 60);
  if (!signed?.signedUrl) return { ok: false as const, status: 503 };

  const response = await fetch(signed.signedUrl, {
    headers: { Range: `bytes=${start}-${end}` },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 206) {
    return { ok: false as const, status: 404 };
  }
  return { ok: true as const, response };
}
