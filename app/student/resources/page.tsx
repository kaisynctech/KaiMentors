import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { ResourcesView } from "@/components/resources-view";
import { StudentShell } from "@/components/student-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getStudentAcademyContext, getStudentLoginHref } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentResourcesPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix, joinAcademyPath } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(getStudentLoginHref(academy));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(getStudentLoginHref(academy));
  if (
    !isPortalFeatureEnabled(
      academy.studentPortalFeatures,
      "resources",
      academy.accessModel,
    )
  ) {
    redirect(`${academy.basePath}${academy.querySuffix}`);
  }

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const { application: app, portal, hasModuleAccess } = ctx;
  const academyName = portal.portal_name;
  const displayName = ctx.fullName?.trim() || user.email?.split("@")[0] || "Student";
  const traderId = app.trader_id;

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={base}
        displayName={displayName}
        hasModuleAccess={hasModuleAccess}
        logoPath={portal.logo_path}
        portalSlug={portal.slug}
        querySuffix={suffix}
        traderId={traderId}
      >
        {children}
      </StudentShell>
    );
  }

  if (!hasModuleAccess) {
    return (
      <Shell>
        <div style={{ padding: "36px 40px 60px", maxWidth: 900 }}>
          <p className="eyebrow">{portal.portal_name}</p>
          <h1 style={{ fontSize: 30, letterSpacing: "-0.04em", margin: "4px 0 8px" }}>
            Resources
          </h1>
          <ContentGate
            applicationStatus={app.status}
            returnPath={`${base}${suffix}`}
          />
        </div>
      </Shell>
    );
  }

  // hasModuleAccess === true is already guaranteed here (the block above returns early
  // otherwise), and the "students_select_resource_items" RLS policy independently enforces
  // this exact access_scope logic for this session-scoped client either way — this filter
  // is a harmless, forward-compatible no-op today, kept in sync with the brief's intent in
  // case that early-return gate is ever loosened.
  let resourceQuery = supabase
    .from("resource_items")
    .select("id,title,description,type,storage_path,external_url,thumbnail_path,labels,access_scope")
    .eq("trader_id", traderId)
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (!hasModuleAccess) {
    resourceQuery = resourceQuery.eq("access_scope", "all_students");
  }
  const { data: rows } = await resourceQuery;

  const admin = createAdminClient();
  const resources = await Promise.all(
    (rows ?? []).map(async (r) => {
      const mediaUrl =
        r.storage_path && admin
          ? (await admin.storage.from("academy-media").createSignedUrl(r.storage_path, 3600))
              .data?.signedUrl ?? null
          : null;
      const thumbnailUrl =
        r.thumbnail_path && admin
          ? (await admin.storage.from("academy-media").createSignedUrl(r.thumbnail_path, 3600))
              .data?.signedUrl ?? null
          : null;
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        type: r.type as "video" | "pdf" | "link",
        mediaUrl,
        thumbnailUrl,
        externalUrl: r.external_url,
        labels: (r.labels ?? []) as string[],
        accessScope: r.access_scope as "all_students" | "all_verified",
      };
    }),
  );

  return (
    <Shell>
      <div style={{ padding: "36px 40px 60px", maxWidth: 900 }}>
        <p className="eyebrow">{portal.portal_name}</p>
        <h1 style={{ fontSize: 30, letterSpacing: "-0.04em", margin: "4px 0 8px" }}>
          Resources
        </h1>
        <p style={{ color: "var(--text-muted)", margin: "0 0 28px" }}>
          Videos, PDFs, and links from your mentor.
        </p>
        <ResourcesView
          hasModuleAccess={hasModuleAccess}
          resources={resources}
          traderId={traderId}
        />
      </div>
    </Shell>
  );
}
