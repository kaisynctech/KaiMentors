import { redirect } from "next/navigation";
import { ArticleSectionTabs, GoldNewsPanel } from "@/components/article-section-tabs";
import { StudentShell } from "@/components/student-shell";
import { getGoldBrief } from "@/lib/fxstreet-gold";
import { academyPublishesExternalNews, marketNotesTabLabel } from "@/lib/market-articles";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { getStudentAcademyContext, getStudentLoginHref } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentArticlesPage({
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
      "articles",
      academy.accessModel,
    )
  ) {
    redirect(`${basePath}${querySuffix}`);
  }

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const { portal, hasModuleAccess } = ctx;
  const displayName = ctx.fullName?.trim() || user.email?.split("@")[0] || "Student";
  const traderId = ctx.application.trader_id;

  const showNews = academyPublishesExternalNews(portal.slug);
  const [{ data: articles }, gold] = await Promise.all([
    supabase
      .from("market_articles")
      .select("id,title,yesterday,today,published_at")
      .eq("trader_id", traderId)
      .eq("published", true)
      .order("published_at", { ascending: false }),
    showNews ? getGoldBrief() : Promise.resolve(null),
  ]);

  return (
    <StudentShell
      academyName={portal.portal_name}
      basePath={basePath}
      displayName={displayName}
      hasModuleAccess={hasModuleAccess}
      logoPath={portal.logo_path}
      portalSlug={portal.slug}
      querySuffix={querySuffix}
      traderId={traderId}
    >
      <div style={{ display: "grid", gap: "1rem", maxWidth: 760, padding: "36px 40px 60px" }}>
        <h1 style={{ margin: 0 }}>Articles</h1>
        <ArticleSectionTabs
          notesLabel={marketNotesTabLabel(portal.slug)}
          notes={
            <div style={{ display: "grid", gap: "1rem" }}>
              {(articles ?? []).length === 0 ? (
                <p>{portal.slug === "bandi-shares" ? "No notes from Bandile yet." : "No notes yet."}</p>
              ) : null}
              {(articles ?? []).map((article) => (
                <article key={article.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", background: "white" }}>
                  <h2 style={{ marginTop: 0 }}>{article.title}</h2>
                  <h3 style={{ fontSize: "0.95rem" }}>Yesterday</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{article.yesterday}</p>
                  <h3 style={{ fontSize: "0.95rem" }}>Today</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{article.today}</p>
                </article>
              ))}
            </div>
          }
          news={gold ? <GoldNewsPanel gold={gold} /> : undefined}
        />
      </div>
    </StudentShell>
  );
}
