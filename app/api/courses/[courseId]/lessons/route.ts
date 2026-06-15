import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const lessonSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1200).nullable(),
  durationMinutes: z.coerce.number().positive().max(1440),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.coerce.number().int().min(0).max(100000),
});

const videoTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
]);

interface LessonsRouteProps {
  params: Promise<{ courseId: string }>;
}

export async function POST(request: Request, { params }: LessonsRouteProps) {
  const { courseId } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Lesson management is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = lessonSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
    durationMinutes: formData.get("durationMinutes"),
    status: formData.get("status"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the lesson details." },
      { status: 400 },
    );
  }

  const video = formData.get("video");
  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json(
      { error: "Choose an MP4 or WebM lesson video." },
      { status: 400 },
    );
  }
  const extension = videoTypes.get(video.type);
  if (!extension || video.size > 500 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Use an MP4 or WebM video smaller than 500 MB." },
      { status: 400 },
    );
  }

  const lessonId = crypto.randomUUID();
  const { error: lessonError } = await supabase.from("lessons").insert({
    id: lessonId,
    trader_id: membership.trader_id,
    course_id: courseId,
    title: parsed.data.title,
    description: parsed.data.description,
    duration_seconds: Math.round(parsed.data.durationMinutes * 60),
    status: parsed.data.status,
    sort_order: parsed.data.sortOrder,
    published_at:
      parsed.data.status === "published" ? new Date().toISOString() : null,
    created_by: user.id,
  });
  if (lessonError) {
    return NextResponse.json(
      { error: "The lesson could not be created." },
      { status: 400 },
    );
  }

  const videoPath = `${membership.trader_id}/${courseId}/${lessonId}/lesson.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("course-content")
    .upload(videoPath, video, {
      cacheControl: "3600",
      contentType: video.type,
      upsert: false,
    });
  if (uploadError) {
    await supabase.from("lessons").delete().eq("id", lessonId);
    return NextResponse.json(
      { error: "The lesson video could not be uploaded." },
      { status: 400 },
    );
  }

  const { error: videoError } = await supabase
    .from("lessons")
    .update({ video_path: videoPath })
    .eq("id", lessonId)
    .eq("trader_id", membership.trader_id);
  if (videoError) {
    await supabase.storage.from("course-content").remove([videoPath]);
    await supabase.from("lessons").delete().eq("id", lessonId);
    return NextResponse.json(
      { error: "The lesson video could not be linked." },
      { status: 400 },
    );
  }

  return NextResponse.json({ lessonId }, { status: 201 });
}
