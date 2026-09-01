import type { SupabaseClient } from "@supabase/supabase-js";
import {
  honourMentorNext,
  honourStudentNext,
  parsePortalSlugFromHref,
  studentHomeHref,
} from "@/lib/academy-routes";

function portalSlugFromJoin(portal: unknown): string | null {
  const row = Array.isArray(portal) ? portal[0] : portal;
  if (!row || typeof row !== "object" || !("slug" in row)) return null;
  const slug = (row as { slug?: unknown }).slug;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

export async function lookupLatestStudentPortalSlug(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("student_applications")
    .select("portal:portals!inner(slug)")
    .eq("student_user_id", userId)
    .neq("status", "rejected")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return portalSlugFromJoin(data?.portal ?? null);
}

export async function resolveStudentDestination(options: {
  supabase: Pick<SupabaseClient, "from">;
  userId: string;
  customDomain: boolean;
  next?: string | null;
  academyPortalSlug?: string | null;
}): Promise<string> {
  const { supabase, userId, customDomain, next, academyPortalSlug } = options;

  if (customDomain) {
    return honourStudentNext(next, academyPortalSlug ?? "", true) ?? "/academy";
  }

  const slug =
    academyPortalSlug ??
    (await lookupLatestStudentPortalSlug(supabase, userId));
  if (!slug) return "/";

  return honourStudentNext(next, slug, false) ?? studentHomeHref(slug, false);
}

async function userBelongsToPortal(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
  portalSlug: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("student_applications")
    .select("id, portal:portals!inner(slug)")
    .eq("student_user_id", userId)
    .neq("status", "rejected")
    .eq("portal.slug", portalSlug)
    .limit(1)
    .maybeSingle();

  return data != null;
}

export async function resolvePlatformLoginDestination(options: {
  supabase: Pick<SupabaseClient, "from">;
  userId: string;
  role: string | null | undefined;
  next?: string | null;
}): Promise<string> {
  const { supabase, userId, role, next } = options;

  if (role === "student") {
    return resolveStudentDestination({
      supabase,
      userId,
      customDomain: false,
      next,
    });
  }

  if (role === "trader") {
    const requestedSlug = parsePortalSlugFromHref(next);
    if (
      requestedSlug &&
      (await userBelongsToPortal(supabase, userId, requestedSlug))
    ) {
      return (
        honourStudentNext(next, requestedSlug, false) ??
        studentHomeHref(requestedSlug, false)
      );
    }

    const studentPath =
      typeof next === "string" &&
      (next === "/student" || next.startsWith("/student/"));
    if (studentPath) {
      const latestSlug = await lookupLatestStudentPortalSlug(supabase, userId);
      if (latestSlug) {
        return (
          honourStudentNext(next, latestSlug, false) ??
          studentHomeHref(latestSlug, false)
        );
      }
    }

    return honourMentorNext(next) ?? "/dashboard";
  }

  if (role === "super_admin") {
    return honourMentorNext(next) ?? "/admin";
  }

  return honourMentorNext(next) ?? "/login";
}
