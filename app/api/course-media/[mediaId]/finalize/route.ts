import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMentorCourseContext, signatureMatches } from "@/lib/course-access";

export async function POST(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data: media } = await context.supabase.from("course_media")
    .select("id,storage_path,mime_type,processing_state,replaces_media_id").eq("id", mediaId).eq("trader_id", context.traderId).maybeSingle();
  if (!media || !["uploading", "processing"].includes(media.processing_state)) return NextResponse.json({ error: "Upload is unavailable." }, { status: 404 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Media verification is unavailable." }, { status: 503 });
  const { data: signed } = await admin.storage.from("course-content").createSignedUrl(media.storage_path, 60);
  if (!signed?.signedUrl) return NextResponse.json({ error: "Uploaded object was not found." }, { status: 400 });
  const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-31" }, cache: "no-store" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || !signatureMatches(bytes, media.mime_type)) {
    await admin.storage.from("course-content").remove([media.storage_path]);
    await context.supabase.from("course_media").update({ processing_state: "failed", failure_reason: "File signature did not match declared MIME type." }).eq("id", media.id);
    return NextResponse.json({ error: "File validation failed." }, { status: 400 });
  }
  await context.supabase.from("course_media").update({ processing_state: "ready", ready_at: new Date().toISOString(), failure_reason: null }).eq("id", media.id);
  if (media.replaces_media_id) {
    const { error: replacementError } = await context.supabase.rpc("replace_course_media", {
      target_old_media_id: media.replaces_media_id,
      target_new_media_id: media.id,
    });
    if (replacementError) return NextResponse.json({ error: "Media uploaded, but replacement could not be completed." }, { status: 409 });
  }
  return NextResponse.json({ status: "ready" });
}
