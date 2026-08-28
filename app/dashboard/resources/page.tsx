import { redirect }          from "next/navigation";
import { DashboardShell }    from "@/components/dashboard-shell";
import { MentorResources }   from "@/components/mentor-resources";
import { getMentorWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedUrls } from "@/lib/signed-urls";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName, portal } = workspace;

  const { data: rows } = await supabase
    .from("resource_items")
    .select("id,title,description,type,storage_path,external_url,thumbnail_path,labels,access_scope,status,created_at")
    .eq("trader_id", traderId)
    .order("sort_order")
    .order("created_at", { ascending: false });

  const admin = createAdminClient();
  // MB-125: one bulk createSignedUrls call replaces what was previously 2N
  // sequential createSignedUrl round-trips (two per row, awaited one after
  // the other, inside an outer Promise.all that only parallelised across
  // rows -- not within a row).
  const urlMap = admin
    ? await signedUrls(admin, "academy-media", [
        ...(rows ?? []).map((r) => r.storage_path),
        ...(rows ?? []).map((r) => r.thumbnail_path),
      ])
    : new Map<string, string | null>();

  const resources = (rows ?? []).map((r) => ({
    id:           r.id,
    title:        r.title,
    description:  r.description,
    type:         r.type as "video" | "pdf" | "link",
    storagePath:  r.storage_path,
    externalUrl:  r.external_url,
    mediaUrl:     r.storage_path ? (urlMap.get(r.storage_path) ?? null) : null,
    thumbnailUrl: r.thumbnail_path ? (urlMap.get(r.thumbnail_path) ?? null) : null,
    labels:       (r.labels ?? []) as string[],
    accessScope:  r.access_scope as "all_students" | "all_verified",
    status:       r.status as "draft" | "published",
    createdAt:    r.created_at,
  }));

  return (
    <DashboardShell
      activePath="/dashboard/resources"
      description="Publish videos, PDFs, and links for your students."
      title="Resources"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <MentorResources resources={resources} traderId={traderId} />
    </DashboardShell>
  );
}
