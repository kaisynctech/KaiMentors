"use server";

import { revalidatePath } from "next/cache";
import { isAcademyActive, isSuperAdminUser } from "@/lib/entitlements";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";

async function requireArticlesWorkspace() {
  const workspace = await getMentorWorkspace();
  if (!workspace) throw new Error("Unauthorized.");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "articles",
      workspace.accessModel,
    )
  ) {
    throw new Error("Articles are turned off for this academy.");
  }
  const bypass = await isSuperAdminUser();
  if (!bypass && !(await isAcademyActive(workspace.traderId))) {
    throw new Error("Subscription inactive. Renew to continue.");
  }
  return workspace;
}

function payloadFromForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const yesterday = String(formData.get("yesterday") ?? "").trim();
  const today = String(formData.get("today") ?? "").trim();
  const published = formData.get("published") === "on";
  if (title.length < 3 || title.length > 160) {
    throw new Error("Give the note a title between 3 and 160 characters.");
  }
  if (!yesterday || !today) {
    throw new Error("Write what happened yesterday and what you are watching today.");
  }
  return {
    title,
    yesterday,
    today,
    published,
    published_at: published ? new Date().toISOString() : null,
  };
}

function revalidateArticleSurfaces() {
  revalidatePath("/dashboard/articles");
  revalidatePath("/student/articles");
}

export async function createMarketArticle(formData: FormData) {
  const workspace = await requireArticlesWorkspace();
  const { error } = await workspace.supabase.from("market_articles").insert({
    ...payloadFromForm(formData),
    trader_id: workspace.traderId,
    created_by: workspace.user.id,
  });
  if (error) throw new Error(error.message);
  revalidateArticleSurfaces();
}

export async function updateMarketArticle(id: string, formData: FormData) {
  const workspace = await requireArticlesWorkspace();
  const payload = payloadFromForm(formData);
  const { data: existing } = await workspace.supabase
    .from("market_articles")
    .select("published, published_at")
    .eq("id", id)
    .eq("trader_id", workspace.traderId)
    .maybeSingle();
  const { error } = await workspace.supabase
    .from("market_articles")
    .update({
      ...payload,
      published_at: payload.published
        ? existing?.published_at ?? payload.published_at
        : null,
    })
    .eq("id", id)
    .eq("trader_id", workspace.traderId);
  if (error) throw new Error(error.message);
  revalidateArticleSurfaces();
}

export async function deleteMarketArticle(id: string) {
  const workspace = await requireArticlesWorkspace();
  const { error } = await workspace.supabase
    .from("market_articles")
    .delete()
    .eq("id", id)
    .eq("trader_id", workspace.traderId);
  if (error) throw new Error(error.message);
  revalidateArticleSurfaces();
}
