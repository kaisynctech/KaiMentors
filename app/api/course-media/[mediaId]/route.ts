import { NextResponse } from "next/server";
import { requireMentorCourseContext } from "@/lib/course-access";

export async function DELETE(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data: referenced } = await context.supabase.rpc("course_media_is_referenced", { target_media_id: mediaId, target_trader_id: context.traderId });
  if (referenced) {
    await context.supabase.from("course_media").update({ processing_state: "deletion_blocked" }).eq("id", mediaId).eq("trader_id", context.traderId);
    return NextResponse.json({ error: "This media is still used by active course content. Replace or remove those references first." }, { status: 409 });
  }
  const { data: media } = await context.supabase.from("course_media").select("storage_path").eq("id", mediaId).eq("trader_id", context.traderId).maybeSingle();
  if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  await context.supabase.from("course_media").update({ processing_state: "archived", archived_at: new Date().toISOString() }).eq("id", mediaId);
  return NextResponse.json({ status: "archived" });
}
