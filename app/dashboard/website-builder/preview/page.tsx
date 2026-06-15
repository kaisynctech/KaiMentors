import { notFound, redirect } from "next/navigation";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import { loadWebsiteBySlug } from "@/lib/website-builder";
import { createClient } from "@/lib/supabase/server";

interface PreviewPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function WebsitePreviewPage({
  searchParams,
}: PreviewPageProps) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: portal } = await supabase
    .from("portals")
    .select("slug")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) notFound();

  const query = await searchParams;
  const data = await loadWebsiteBySlug(portal.slug, {
    includeDraft: true,
    pageSlug: query.page,
  });
  if (!data) notFound();

  const currentPage =
    query.page ?? data.pages.find((page) => page.is_home)?.slug ?? "home";
  return <WebsiteRenderer currentPageSlug={currentPage} data={data} preview />;
}
