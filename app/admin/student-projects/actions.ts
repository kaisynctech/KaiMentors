"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin-access";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function createProject(formData: FormData) {
  await requirePlatformAdmin();
  const supabase = adminClient();
  const tools = (formData.get("tools") as string)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const { error } = await supabase.from("student_projects").insert({
    title: formData.get("title"),
    student_name: formData.get("student_name"),
    description: formData.get("description"),
    category: formData.get("category"),
    live_url: formData.get("live_url") || null,
    github_url: formData.get("github_url") || null,
    thumbnail_url: formData.get("thumbnail_url") || null,
    tools,
    featured: formData.get("featured") === "on",
    published: formData.get("published") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/student-projects");
}

export async function updateProject(id: string, formData: FormData) {
  await requirePlatformAdmin();
  const supabase = adminClient();
  const tools = (formData.get("tools") as string)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const { error } = await supabase
    .from("student_projects")
    .update({
      title: formData.get("title"),
      student_name: formData.get("student_name"),
      description: formData.get("description"),
      category: formData.get("category"),
      live_url: formData.get("live_url") || null,
      github_url: formData.get("github_url") || null,
      thumbnail_url: formData.get("thumbnail_url") || null,
      tools,
      featured: formData.get("featured") === "on",
      published: formData.get("published") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/student-projects");
}

export async function deleteProject(id: string) {
  await requirePlatformAdmin();
  const supabase = adminClient();
  const { error } = await supabase
    .from("student_projects")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/student-projects");
}

export async function togglePublished(id: string, current: boolean) {
  await requirePlatformAdmin();
  const supabase = adminClient();
  const { error } = await supabase
    .from("student_projects")
    .update({ published: !current })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/student-projects");
}

export async function toggleFeatured(id: string, current: boolean) {
  await requirePlatformAdmin();
  const supabase = adminClient();
  const { error } = await supabase
    .from("student_projects")
    .update({ featured: !current })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/student-projects");
}
