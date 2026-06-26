import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1200).nullable(),
    status: z.enum(["draft", "published", "archived"]),
    sortOrder: z.coerce.number().int().min(0).max(100000),
    accessMode: z.enum(["all_verified", "restricted", "one_to_one"]),
    groupIds: z.array(z.string().uuid()).max(100),
    studentIds: z.array(z.string().uuid()).max(100),
    acknowledgeImpact: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.accessMode === "restricted" && value.groupIds.length + value.studentIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Restricted courses require a group.",
        path: ["accessMode"],
      });
    }
    if (value.accessMode === "one_to_one" && value.studentIds.length !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: "One-to-one courses require exactly one student.", path: ["studentIds"] });
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
    .select("id,cover_path,status,sort_order,access_mode")
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
    accessMode: formData.get("accessMode") ?? formData.get("accessScope"),
    groupIds: formData.getAll("groupIds"),
    studentIds: formData.getAll("studentIds"),
    acknowledgeImpact: formData.get("acknowledgeImpact") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the course details." },
      { status: 400 },
    );
  }

  const materialChange = existing.status !== parsed.data.status || existing.sort_order !== parsed.data.sortOrder || existing.access_mode !== parsed.data.accessMode;
  if (materialChange && !parsed.data.acknowledgeImpact) {
    const { count } = await supabase.from("lesson_progress").select("*", { count: "exact", head: true }).eq("course_id", courseId);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "This change affects active learners. Confirm the impact before continuing.", requiresConfirmation: true }, { status: 409 });
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

  const { error } = await supabase.rpc("update_course_curriculum_settings", {
    target_course_id: courseId,
    target_title: parsed.data.title,
    target_description: parsed.data.description,
    target_status: parsed.data.status,
    target_sort_order: parsed.data.sortOrder,
    target_cover_path: coverPath,
    target_mode: parsed.data.accessMode,
    target_group_ids: parsed.data.groupIds,
    target_student_ids: parsed.data.studentIds,
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

  // Cascade: when a course transitions to published for the first time,
  // auto-publish all its modules and lessons so mentors don't have to
  // manually publish each piece of content.
  const isPublishTransition =
    existing.status !== "published" && parsed.data.status === "published";
  if (isPublishTransition) {
    await Promise.all([
      supabase
        .from("course_modules")
        .update({ status: "published" })
        .eq("course_id", courseId)
        .eq("trader_id", membership.trader_id),
      supabase
        .from("lessons")
        .update({ status: "published" })
        .eq("course_id", courseId)
        .eq("trader_id", membership.trader_id),
    ]);
  }

  if (existing.cover_path && coverPath !== existing.cover_path) {
    await supabase.storage
      .from("course-content")
      .remove([existing.cover_path]);
  }

  return NextResponse.json({ status: "updated" });
}
