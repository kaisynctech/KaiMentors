import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { StudentProjectsView } from "@/components/student-projects-view";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import type { StudentProject } from "@/lib/student-projects";
import { getStudentAcademyContext, getStudentLoginHref } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath, querySuffix, joinAcademyPath } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(getStudentLoginHref(academy));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(getStudentLoginHref(academy));
  if (
    !isPortalFeatureEnabled(
      academy.studentPortalFeatures,
      "projects",
      academy.accessModel,
    )
  ) {
    redirect(`${academy.basePath}${academy.querySuffix}`);
  }

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const { application, portal, hasModuleAccess } = ctx;
  const academyName = portal.portal_name;
  const displayName = ctx.fullName?.trim() || user.email?.split("@")[0] || "Student";
  const traderId = application.trader_id;

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={basePath}
        displayName={displayName}
        hasModuleAccess={hasModuleAccess}
        logoPath={portal.logo_path}
        portalSlug={portal.slug}
        querySuffix={querySuffix}
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
            Projects
          </h1>
          <ContentGate
            applicationStatus={application.status}
            returnPath={`${basePath}${querySuffix}`}
          />
        </div>
      </Shell>
    );
  }

  const { data: rows } = await supabase
    .from("student_projects")
    .select(
      "id,title,student_name,description,category,live_url,github_url,thumbnail_url,tools,featured,published,created_at",
    )
    .eq("trader_id", traderId)
    .eq("published", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  const projects = (rows ?? []).map((row) => ({
    ...row,
    tools: Array.isArray(row.tools) ? row.tools : [],
  })) as StudentProject[];

  return (
    <Shell>
      <div style={{ padding: "36px 40px 60px", maxWidth: 900 }}>
        <p className="eyebrow">{portal.portal_name}</p>
        <h1 style={{ fontSize: 30, letterSpacing: "-0.04em", margin: "4px 0 8px" }}>
          Projects
        </h1>
        <p style={{ color: "var(--text-muted)", margin: "0 0 28px" }}>
          Real work from students in this academy.
        </p>
        <StudentProjectsView projects={projects} />
      </div>
    </Shell>
  );
}
