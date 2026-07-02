import { redirect }              from "next/navigation";
import { StudentShell }          from "@/components/student-shell";
import { ResourcesView }         from "@/components/resources-view";
import { createClient }          from "@/lib/supabase/server";
import { createAdminClient }     from "@/lib/supabase/admin";
import { getStudentAcademyContext } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentResourcesPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query   = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${base}/login${suffix}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/login${suffix}`);

  let appQuery = supabase
    .from("student_applications")
    .select("id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)")
    .eq("student_user_id", user.id);
  if (academy.portalId)   appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);

  const { data: app } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal      = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = portal?.portal_name ?? "Academy";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified  = app.status === "verified";
  const traderId    = app.trader_id as string;

  const { data: rows } = await supabase
    .from("resource_items")
    .select("id,title,description,type,storage_path,external_url,thumbnail_path,labels,access_scope")
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
        mediaUrl,
        thumbnailUrl,
        externalUrl:  r.external_url,
        labels:       (r.labels ?? []) as string[],
        accessScope:  r.access_scope as "all_students" | "all_verified",
      };
    }),
  );

  return (
    <StudentShell
      academyName={academyName}
      basePath={base}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      portalSlug={portal?.slug}
      querySuffix={suffix}
      traderId={traderId}
    >
      <div style={{ padding: "36px 40px 60px", maxWidth: 900 }}>
        <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
        <h1 style={{ fontSize: 30, letterSpacing: "-0.04em", margin: "4px 0 8px" }}>Resources</h1>
        <p style={{ color: "var(--text-muted)", margin: "0 0 28px" }}>
          Videos, PDFs, and links from your mentor.
        </p>
        <ResourcesView
          isVerified={isVerified}
          resources={resources}
          traderId={traderId}
        />
      </div>
    </StudentShell>
  );
}
