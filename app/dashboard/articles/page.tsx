import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MentorMarketArticles } from "@/components/mentor-market-articles";
import { getGoldBrief } from "@/lib/fxstreet-gold";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { academyPublishesExternalNews, marketNotesTabLabel, type MarketArticle } from "@/lib/market-articles";
import { getMentorWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MentorArticlesPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "articles",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }
  const { supabase, traderId, displayName, portal } = workspace;
  const notesLabel = marketNotesTabLabel(portal.slug);
  const showNews = academyPublishesExternalNews(portal.slug);

  const [{ data: rows }, gold] = await Promise.all([
    supabase
      .from("market_articles")
      .select("id,title,yesterday,today,published,published_at,created_at")
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false }),
    showNews ? getGoldBrief() : Promise.resolve(null),
  ]);

  return (
    <DashboardShell
      activePath="/dashboard/articles"
      description={
        showNews
          ? `${notesLabel} are the morning posts. News is what FXStreet is reporting on gold.`
          : "Publish articles for the website and the student portal."
      }
      title="Articles"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <MentorMarketArticles articles={(rows ?? []) as MarketArticle[]} gold={gold} notesLabel={notesLabel} />
    </DashboardShell>
  );
}
