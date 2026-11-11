import { NextResponse } from "next/server";
import { isPortalSlug } from "@/lib/academy-routes";
import { getGoldBrief } from "@/lib/fxstreet-gold";
import { academyPublishesExternalNews } from "@/lib/market-articles";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const portalSlug = new URL(request.url).searchParams.get("portal");
  if (!isPortalSlug(portalSlug)) {
    return NextResponse.json({ error: "Invalid academy." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Articles are unavailable." }, { status: 503 });
  }

  const { data: portal } = await admin
    .from("portals")
    .select("trader_id, student_portal_features")
    .eq("slug", portalSlug)
    .maybeSingle();
  if (!portal?.trader_id) {
    return NextResponse.json({ error: "Academy not found." }, { status: 404 });
  }

  const features = (portal.student_portal_features ?? {}) as Record<string, boolean>;
  if (features.articles !== true) {
    return NextResponse.json({
      articles: [],
      gold: {
        source: "FXStreet",
        sourceUrl: "https://www.fxstreet.com/news/feed",
        items: [],
        unavailable: true,
      },
    });
  }

  const includeNews = academyPublishesExternalNews(portalSlug);
  const [{ data, error }, gold] = await Promise.all([
    admin
      .from("market_articles")
      .select("id,title,yesterday,today,published_at")
      .eq("trader_id", portal.trader_id)
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(30),
    includeNews ? getGoldBrief() : Promise.resolve(null),
  ]);

  if (error) {
    return NextResponse.json({ error: "Articles could not be loaded." }, { status: 400 });
  }

  return NextResponse.json({ articles: data ?? [], gold });
}
