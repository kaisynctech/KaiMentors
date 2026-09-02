"use server";

import { revalidatePath } from "next/cache";
import { isAcademyActive, isSuperAdminUser } from "@/lib/entitlements";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { parseStudentProjectTools } from "@/lib/student-projects";
import { getMentorWorkspace } from "@/lib/workspace";

async function requireProjectsWorkspace() {
  const workspace = await getMentorWorkspace();
  if (!workspace) throw new Error("Unauthorized.");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "projects",
      workspace.accessModel,
    )
  ) {
    throw new Error("Projects are turned off for this academy.");
  }
  const bypass = await isSuperAdminUser();
  if (!bypass && !(await isAcademyActive(workspace.traderId))) {
    throw new Error("Subscription inactive. Renew to continue.");
  }
  return workspace;
}

function payloadFromForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    student_name: String(formData.get("student_name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    category: String(formData.get("category") ?? "web-app"),
    live_url: String(formData.get("live_url") ?? "").trim() || null,
    github_url: String(formData.get("github_url") ?? "").trim() || null,
    thumbnail_url: String(formData.get("thumbnail_url") ?? "").trim() || null,
    tools: parseStudentProjectTools(formData.get("tools")),
    featured: formData.get("featured") === "on",
    published: formData.get("published") === "on",
  };
}

function revalidateProjectSurfaces() {
  revalidatePath("/dashboard/projects");
  revalidatePath("/student/projects");
}

export async function createProject(formData: FormData) {
  const workspace = await requireProjectsWorkspace();
  const { error } = await workspace.supabase.from("student_projects").insert({
    ...payloadFromForm(formData),
    trader_id: workspace.traderId,
    created_by: workspace.user.id,
  });
  if (error) throw new Error(error.message);
  revalidateProjectSurfaces();
}

export async function updateProject(id: string, formData: FormData) {
  const workspace = await requireProjectsWorkspace();
  const { error } = await workspace.supabase
    .from("student_projects")
    .update(payloadFromForm(formData))
    .eq("id", id)
    .eq("trader_id", workspace.traderId);
  if (error) throw new Error(error.message);
  revalidateProjectSurfaces();
}

export async function deleteProject(id: string) {
  const workspace = await requireProjectsWorkspace();
  const { error } = await workspace.supabase
    .from("student_projects")
    .delete()
    .eq("id", id)
    .eq("trader_id", workspace.traderId);
  if (error) throw new Error(error.message);
  revalidateProjectSurfaces();
}

export async function togglePublished(id: string, current: boolean) {
  const workspace = await requireProjectsWorkspace();
  const { error } = await workspace.supabase
    .from("student_projects")
    .update({ published: !current })
    .eq("id", id)
    .eq("trader_id", workspace.traderId);
  if (error) throw new Error(error.message);
  revalidateProjectSurfaces();
}

export async function toggleFeatured(id: string, current: boolean) {
  const workspace = await requireProjectsWorkspace();
  const { error } = await workspace.supabase
    .from("student_projects")
    .update({ featured: !current })
    .eq("id", id)
    .eq("trader_id", workspace.traderId);
  if (error) throw new Error(error.message);
  revalidateProjectSurfaces();
}
