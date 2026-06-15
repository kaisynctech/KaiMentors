import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { WebsiteBuilder } from "@/components/website-builder";
import { WebsiteBuilderNavigation } from "@/components/website-builder-navigation";
import type {
  WebsiteNavigationItem,
  WebsitePage,
  WebsiteSection,
  WebsiteTemplate,
  WebsiteTheme,
} from "@/lib/website-builder";
import { createClient } from "@/lib/supabase/server";

export default async function WebsiteBuilderPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: portal } = await supabase
    .from("portals")
    .select("id,portal_name,slug,is_published")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) redirect("/dashboard");

  const [templatesResult, themeResult, pagesResult, navigationResult] =
    await Promise.all([
      supabase
        .from("website_templates")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("name"),
      supabase
        .from("website_theme_settings")
        .select("*")
        .eq("portal_id", portal.id)
        .maybeSingle(),
      supabase
        .from("website_pages")
        .select("*")
        .eq("portal_id", portal.id)
        .order("sort_order"),
      supabase
        .from("website_navigation")
        .select("*")
        .eq("portal_id", portal.id)
        .order("sort_order"),
    ]);

  if (themeResult.error || !themeResult.data || pagesResult.error) {
    redirect("/dashboard");
  }

  const pages = (pagesResult.data ?? []) as WebsitePage[];
  const pageIds = pages.map((page) => page.id);
  const { data: sections } = pageIds.length
    ? await supabase
        .from("website_sections")
        .select("*")
        .in("page_id", pageIds)
        .order("sort_order")
    : { data: [] };

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/website-builder"
      description="Build, preview, and publish a complete academy website from reusable templates and sections."
      title="Website Builder"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <WebsiteBuilderNavigation active="builder" />
      <WebsiteBuilder
        navigation={(navigationResult.data ?? []) as WebsiteNavigationItem[]}
        pages={pages}
        portal={portal}
        sections={(sections ?? []) as WebsiteSection[]}
        templates={(templatesResult.data ?? []) as WebsiteTemplate[]}
        theme={themeResult.data as WebsiteTheme}
      />
    </DashboardShell>
  );
}
