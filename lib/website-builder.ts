import type { PublicBrokerOption } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type {
  WebsiteCourse,
  WebsiteData,
  WebsiteNavigationItem,
  WebsitePage,
  WebsitePortal,
  WebsiteSection,
  WebsiteTemplate,
  WebsiteTheme,
} from "@/lib/website-types";
export type {
  WebsiteCourse,
  WebsiteData,
  WebsiteNavigationItem,
  WebsitePage,
  WebsitePortal,
  WebsiteSection,
  WebsiteTemplate,
  WebsiteTheme,
} from "@/lib/website-types";

interface WebsiteReleaseSnapshot {
  portal: WebsitePortal;
  template: WebsiteTemplate;
  theme: WebsiteTheme;
  pages: WebsitePage[];
  sections: WebsiteSection[];
  navigation: WebsiteNavigationItem[];
}

function isReleaseSnapshot(value: unknown): value is WebsiteReleaseSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<WebsiteReleaseSnapshot>;
  return Boolean(
    snapshot.portal &&
      snapshot.template &&
      snapshot.theme &&
      Array.isArray(snapshot.pages) &&
      Array.isArray(snapshot.sections) &&
      Array.isArray(snapshot.navigation),
  );
}

async function loadPublishedSnapshot(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  portalId: string,
) {
  const { data: publication } = await supabase
    .from("website_publications")
    .select("current_release_id,unpublished_at")
    .eq("portal_id", portalId)
    .is("unpublished_at", null)
    .maybeSingle();
  if (!publication?.current_release_id) return null;

  const { data: release } = await supabase
    .from("website_releases")
    .select("snapshot")
    .eq("id", publication.current_release_id)
    .eq("portal_id", portalId)
    .maybeSingle();
  return isReleaseSnapshot(release?.snapshot) ? release.snapshot : null;
}

async function loadDraftSnapshot(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  portal: WebsitePortal,
) {
  const [themeResult, pagesResult, navigationResult] = await Promise.all([
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
  if (themeResult.error || !themeResult.data || pagesResult.error) return null;

  const pages = (pagesResult.data ?? []) as WebsitePage[];
  const pageIds = pages.map((page) => page.id);
  const { data: sections, error: sectionsError } = pageIds.length
    ? await supabase
        .from("website_sections")
        .select("*")
        .in("page_id", pageIds)
        .order("sort_order")
    : { data: [], error: null };
  if (sectionsError) return null;

  const theme = themeResult.data as WebsiteTheme;
  const { data: template } = await supabase
    .from("website_templates")
    .select("*")
    .eq("id", theme.template_id)
    .maybeSingle();
  if (!template) return null;

  return {
    portal,
    template: template as WebsiteTemplate,
    theme,
    pages,
    sections: (sections ?? []) as WebsiteSection[],
    navigation: (navigationResult.data ?? []) as WebsiteNavigationItem[],
  } satisfies WebsiteReleaseSnapshot;
}

async function loadPublicDependencies(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  snapshot: WebsiteReleaseSnapshot,
  includeDraft: boolean,
) {
  const [coursesResult, brokerResult] = await Promise.all([
    includeDraft
      ? supabase
          .from("courses")
          .select("id,title,description,cover_path")
          .eq("trader_id", snapshot.portal.trader_id)
          .eq("status", "published")
          .order("sort_order")
          .limit(12)
      : supabase.rpc("get_public_website_courses", {
          target_portal_slug: snapshot.portal.slug,
        }),
    supabase.rpc("get_public_portal_broker_options", {
      target_portal_slug: snapshot.portal.slug,
    }),
  ]);

  const brokers = ((brokerResult.data ?? []) as PublicBrokerOption[]).map(
    (option) => ({
      id: option.broker_id,
      name: option.broker_name,
      slug: option.broker_slug,
      logo_path: option.broker_logo_path,
      connectionId: option.connection_id,
      affiliateLink: option.affiliate_link,
      verificationMethod: option.verification_method,
    }),
  );
  const courseRows = (coursesResult.data ?? []) as Omit<
    WebsiteCourse,
    "coverUrl"
  >[];
  const courses = await Promise.all(
    courseRows.map(async (course) => {
      if (!includeDraft || !course.cover_path) {
        return { ...course, cover_path: course.cover_path ?? null, coverUrl: null };
      }
      const { data } = await supabase.storage
        .from("course-content")
        .createSignedUrl(course.cover_path, 3600);
      return { ...course, coverUrl: data?.signedUrl ?? null };
    }),
  );

  return { brokers, courses };
}

export async function loadWebsiteBySlug(
  slug: string,
  options: { includeDraft?: boolean; pageSlug?: string } = {},
): Promise<WebsiteData | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  let portalQuery = supabase
    .from("portals")
    .select(
      "id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,whatsapp_number,telegram_url,instagram_url,primary_color,accent_color,logo_path,cta_label,broker_cta_label,is_published,website_delivery_mode",
    )
    .eq("slug", slug);
  if (!options.includeDraft) portalQuery = portalQuery.eq("is_published", true);

  const { data: portal } = await portalQuery.maybeSingle();
  if (!portal) return null;
  if (portal.website_delivery_mode !== "builder_template") return null;

  const snapshot = options.includeDraft
    ? await loadDraftSnapshot(supabase, portal as WebsitePortal)
    : await loadPublishedSnapshot(supabase, portal.id);
  if (!snapshot) return null;

  const visiblePages = options.includeDraft
    ? snapshot.pages
    : snapshot.pages.filter((page) => page.is_enabled);
  const selectedPage = options.pageSlug
    ? visiblePages.find((page) => page.slug === options.pageSlug)
    : visiblePages.find((page) => page.is_home);
  if (!selectedPage) return null;

  const { brokers, courses } = await loadPublicDependencies(
    supabase,
    snapshot,
    Boolean(options.includeDraft),
  );

  return {
    portal: snapshot.portal,
    template: snapshot.template,
    theme: snapshot.theme,
    pages: visiblePages,
    sections: snapshot.sections.filter(
      (section) =>
        section.page_id === selectedPage.id &&
        (options.includeDraft || section.is_enabled),
    ),
    navigation: snapshot.navigation.filter(
      (item) => options.includeDraft || item.is_enabled,
    ),
    courses,
    brokers,
  };
}
