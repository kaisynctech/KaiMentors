import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const statusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});

interface RouteProps {
  params: Promise<{ courseId: string }>;
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const { courseId } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
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
    .select("id")
    .eq("id", courseId)
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
  }

  if (parsed.data.status === "published") {
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

  const { error } = await supabase
    .from("courses")
    .update({ status: parsed.data.status })
    .eq("id", courseId)
    .eq("trader_id", membership.trader_id);
  if (error) {
    return NextResponse.json({ error: "The course could not be updated." }, { status: 400 });
  }

  return NextResponse.json({ status: "updated" });
}
