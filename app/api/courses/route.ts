import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const courseSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1200).nullable(),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.coerce.number().int().min(0).max(100000),
});

const thumbnailTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70);
  return `${base || "course"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Course management is not configured." },
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
    return NextResponse.json(
      { error: "No mentor workspace was found." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
    status: formData.get("status"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the course details." },
      { status: 400 },
    );
  }

  const thumbnail = formData.get("thumbnail");
  if (thumbnail instanceof File && thumbnail.size > 0) {
    if (
      !thumbnailTypes.has(thumbnail.type) ||
      thumbnail.size > 5 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "Use a PNG, JPG, or WebP thumbnail smaller than 5 MB." },
        { status: 400 },
      );
    }
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      trader_id: membership.trader_id,
      title: parsed.data.title,
      slug: slugify(parsed.data.title),
      description: parsed.data.description,
      status: parsed.data.status,
      sort_order: parsed.data.sortOrder,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (courseError || !course) {
    return NextResponse.json(
      { error: "The course could not be created." },
      { status: 400 },
    );
  }

  let coverPath: string | null = null;
  if (thumbnail instanceof File && thumbnail.size > 0) {
    const extension = thumbnailTypes.get(thumbnail.type);
    coverPath = `${membership.trader_id}/${course.id}/thumbnail.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("course-content")
      .upload(coverPath, thumbnail, {
        cacheControl: "3600",
        contentType: thumbnail.type,
        upsert: false,
      });
    if (uploadError) {
      await supabase.from("courses").delete().eq("id", course.id);
      return NextResponse.json(
        { error: "The course thumbnail could not be uploaded." },
        { status: 400 },
      );
    }

    const { error: coverError } = await supabase
      .from("courses")
      .update({ cover_path: coverPath })
      .eq("id", course.id)
      .eq("trader_id", membership.trader_id);
    if (coverError) {
      await supabase.storage.from("course-content").remove([coverPath]);
      await supabase.from("courses").delete().eq("id", course.id);
      return NextResponse.json(
        { error: "The course thumbnail could not be linked." },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ courseId: course.id }, { status: 201 });
}
