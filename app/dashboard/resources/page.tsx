import { redirect }          from "next/navigation";
import { DashboardShell }    from "@/components/dashboard-shell";
import { MentorResources }   from "@/components/mentor-resources";
import { getMentorWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const resources = await Promise.all(
    (rows ?? []).map(async (r) => {
      const mediaUrl = r.storage_path && admin
        ? (await admin.storage.from("academy-media").createSignedUrl(r.storage_path, 3600)).data?.signedUrl ?? null
        : null;
      const thumbnailUrl = r.thumbnail_path && admin
        ? (await admin.storage.from("academy-media").createSignedUrl(r.thumbnail_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        id:           r.id,
        title:        r.title,
        description:  r.description,
        type:         r.type as "video" | "pdf" | "link",
        storagePath:  r.storage_path,
        externalUrl:  r.external_url,
        mediaUrl,
        thumbnailUrl,
        labels:       (r.labels ?? []) as string[],
        accessScope:  r.access_scope as "all_students" | "all_verified",
        status:       r.status as "draft" | "published",
        createdAt:    r.created_at,
      };
    }),
  );

  return (
    <DashboardShell
      activePath="/dashboard/resources"
      description="Publish videos, PDFs, and links for your students."
      title="Resources"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
    >
      <MentorResources resources={resources} traderId={traderId} />
    </DashboardShell>
  );
}
