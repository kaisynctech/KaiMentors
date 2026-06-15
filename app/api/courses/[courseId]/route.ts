import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1200).nullable(),
    status: z.enum(["draft", "published", "archived"]),
    sortOrder: z.coerce.number().int().min(0).max(100000),
    accessScope: z.enum(["all_verified", "restricted"]),
    groupIds: z.array(z.string().uuid()).max(100),
  })
  .superRefine((value, context) => {
    if (value.accessScope === "restricted" && value.groupIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Restricted courses require a group.",
        path: ["groupIds"],
      });
    }
  });

const thumbnailTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

interface CourseRouteProps {
  params: Promise<{ courseId: string }>;
}

export async function PATCH(request: Request, { params }: CourseRouteProps) {
  const { courseId } = await params;
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
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("courses")
    .select("id,cover_path")
    .eq("id", courseId)
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = updateSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
    status: formData.get("status"),
    sortOrder: formData.get("sortOrder"),
    accessScope: formData.get("accessScope"),
    groupIds: formData.getAll("groupIds"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the course details." },
      { status: 400 },
    );
  }

  if (parsed.data.groupIds.length) {
    const { count } = await supabase
      .from("student_groups")
      .select("*", { count: "exact", head: true })
      .eq("trader_id", membership.trader_id)
      .in("id", parsed.data.groupIds);
    if (count !== new Set(parsed.data.groupIds).size) {
      return NextResponse.json(
        { error: "One or more selected student groups are invalid." },
        { status: 400 },
      );
    }
  }

  let coverPath = existing.cover_path as string | null;
  const thumbnail = formData.get("thumbnail");
  if (thumbnail instanceof File && thumbnail.size > 0) {
    const extension = thumbnailTypes.get(thumbnail.type);
    if (!extension || thumbnail.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Use a PNG, JPG, or WebP thumbnail smaller than 5 MB." },
        { status: 400 },
      );
    }

    const nextPath = `${membership.trader_id}/${courseId}/thumbnail-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("course-content")
      .upload(nextPath, thumbnail, {
        cacheControl: "3600",
        contentType: thumbnail.type,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: "The course thumbnail could not be uploaded." },
        { status: 400 },
      );
    }
    coverPath = nextPath;
  }

  const { error } = await supabase.rpc("update_course_with_access", {
    target_course_id: courseId,
    target_title: parsed.data.title,
    target_description: parsed.data.description,
    target_status: parsed.data.status,
    target_sort_order: parsed.data.sortOrder,
    target_cover_path: coverPath,
    target_scope: parsed.data.accessScope,
    target_group_ids: parsed.data.groupIds,
  });
  if (error) {
    if (coverPath !== existing.cover_path && coverPath) {
      await supabase.storage.from("course-content").remove([coverPath]);
    }
    return NextResponse.json(
      { error: "The course could not be updated." },
      { status: 400 },
    );
  }

  if (existing.cover_path && coverPath !== existing.cover_path) {
    await supabase.storage
      .from("course-content")
      .remove([existing.cover_path]);
  }

  return NextResponse.json({ status: "updated" });
}
