import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PublicBrokerOption } from "@/lib/database.types";
import {
  getAcademyEntryHref,
  getAcademyWebsitePageHref,
} from "@/lib/academy-routes";
import type { ResolvedWebsiteDomain } from "@/lib/domains/resolution";
import { createClient } from "@/lib/supabase/server";

export type WebsiteDeliveryMode =
  | "core_page"
  | "builder_template"
  | "custom_package"
  | "external_website";

export interface CustomSiteEditableField {
  key: string;
  label: string;
  type: "text" | "url" | "textarea";
  default?: string;
}

export interface CustomSitePackagePage {
  slug: string;
  file: string;
  label: string;
  path: string;
}

export interface CustomSiteManifest {
  pages: CustomSitePackagePage[];
  reservedLinks?: Record<string, string>;
  poweredByLabel?: string;
  /** `static_export` serves pre-built Next.js HTML from asset_base_path via iframe. */
  renderMode?: "html" | "static_export";
}

export interface CustomSitePackage {
  id: string;
  package_key: string;
  version: number;
  name: string;
  description: string;
  category: string;
  thumbnail_path: string | null;
  asset_base_path: string;
  entry_page: string;
  manifest: CustomSiteManifest;
  editable_schema: CustomSiteEditableField[];
  reserved_paths: string[];
  is_active: boolean;
}

export interface CustomSiteAssignment {
  id: string;
  trader_id: string;
  portal_id: string;
  package_id: string;
  status: "draft" | "active" | "paused";
  content_overrides: Record<string, string>;
  show_powered_by: boolean;
  assigned_by: string | null;
  activated_at: string | null;
}

export interface CustomSitePortal {
  id: string;
  trader_id: string;
  slug: string;
  portal_name: string;
  hero_title: string;
  hero_subtitle: string | null;
  welcome_message: string;
  primary_color: string;
  accent_color: string;
  logo_path: string | null;
  is_published: boolean;
  website_delivery_mode: WebsiteDeliveryMode;
  contact_phone?:  string | null;
  contact_email?:  string | null;
  whatsapp_number?: string | null;
  telegram_url?:   string | null;
  instagram_url?:  string | null;
  facebook_url?:   string | null;
  youtube_url?:    string | null;
  twitter_url?:    string | null;
  tiktok_url?:     string | null;
  linkedin_url?:   string | null;
}

export interface ContactInfo {
  phone:     string | null;
  email:     string | null;
  whatsapp:  string | null;
  telegram:  string | null;
  instagram: string | null;
  facebook:  string | null;
  youtube:   string | null;
  twitter:   string | null;
  tiktok:    string | null;
  linkedin:  string | null;
}

export interface LoadedCustomSite {
  portal: CustomSitePortal;
  package: CustomSitePackage;
  assignment: CustomSiteAssignment;
  page: CustomSitePackagePage;
  title: string;
  description: string | null;
  bodyHtml: string;
  assetBasePath: string;
  staticExportUrl?: string;
  contactInfo: ContactInfo;
}

export interface CustomSiteBroker {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  connectionId: string;
  affiliateLink: string | null;
  verificationMethod: PublicBrokerOption["verification_method"];
}

export interface CustomSiteJoinData {
  portal: CustomSitePortal;
  package: CustomSitePackage;
  assignment: CustomSiteAssignment;
  brokers: CustomSiteBroker[];
}

interface AssignmentRow extends CustomSiteAssignment {
  package: CustomSitePackage | CustomSitePackage[] | null;
}

function normalizeManifest(value: unknown): CustomSiteManifest {
  if (!value || typeof value !== "object") return { pages: [] };
  const manifest = value as Partial<CustomSiteManifest>;
  return {
    pages: Array.isArray(manifest.pages) ? manifest.pages : [],
    reservedLinks:
      manifest.reservedLinks && typeof manifest.reservedLinks === "object"
        ? manifest.reservedLinks
        : {},
    poweredByLabel:
      typeof manifest.poweredByLabel === "string"
        ? manifest.poweredByLabel
        : "Powered by KaiMentors",
    renderMode:
      manifest.renderMode === "static_export" ? "static_export" : "html",
  };
}

function normalizePackage(row: CustomSitePackage): CustomSitePackage {
  return {
    ...row,
    manifest: normalizeManifest(row.manifest),
    editable_schema: Array.isArray(row.editable_schema)
      ? row.editable_schema
      : [],
    reserved_paths: Array.isArray(row.reserved_paths) ? row.reserved_paths : [],
  };
}

function pageForPath(sitePackage: CustomSitePackage, routePath: string[]) {
  const segment = routePath[0] ?? "";
  if (routePath.length > 1) return null;
  if (!segment) {
    return (
      sitePackage.manifest.pages.find(
        (page) => page.slug === sitePackage.entry_page,
      ) ??
      sitePackage.manifest.pages.find((page) => page.path === "/") ??
      null
    );
  }
  return (
    sitePackage.manifest.pages.find(
      (page) =>
        page.slug === segment ||
        page.path.replace(/^\//, "") === segment ||
        page.file === `${segment}.html`,
    ) ?? null
  );
}

function safePackageFilePath(assetBasePath: string, fileName: string) {
  const publicRoot = path.join(process.cwd(), "public");
  const resolved = path.resolve(
    publicRoot,
    assetBasePath.replace(/^\//, ""),
    fileName,
  );
  if (!resolved.startsWith(publicRoot)) {
    throw new Error("Invalid custom site package path.");
  }
  return resolved;
}

function extractTitle(html: string, fallback: string) {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || fallback;
}

function extractDescription(html: string) {
  return (
    html
      .match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]
      ?.trim() ?? null
  );
}

function extractBody(html: string) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function rewriteHtml(
  html: string,
  sitePackage: CustomSitePackage,
  overrides: Record<string, string>,
  portalSlug: string,
  customDomain: boolean,
) {
  const assetBase = sitePackage.asset_base_path;
  const reservedLinks = sitePackage.manifest.reservedLinks ?? {};
  const routeContext = { portalSlug, customDomain };
  const pageLinks = new Map(
    sitePackage.manifest.pages.map((page) => [
      page.file,
      getAcademyWebsitePageHref(routeContext, page.path),
    ]),
  );
  const reservedEntryLinks = new Map([
    ["/join-academy", getAcademyEntryHref(routeContext, "join-academy")],
    ["/login", getAcademyEntryHref(routeContext, "login")],
    ["/academy", getAcademyEntryHref(routeContext, "academy")],
    ["/student", getAcademyEntryHref(routeContext, "academy")],
  ]);

  let output = extractBody(html)
    .replace(/\s(?:src|href)=["'](?:\.\/)?styles\.css["']/gi, "")
    .replace(
      /(src|href)=["'](?:\.\/)?assets\//gi,
      `$1="${assetBase}/assets/`,
    )
    .replace(/href=["']([^"']+)["']/gi, (_match, rawValue: string) => {
      const [target, hash = ""] = rawValue.split("#");
      const absoluteEntryTarget = reservedEntryLinks.get(target);
      if (absoluteEntryTarget) {
        return `href="${absoluteEntryTarget}${hash ? `#${hash}` : ""}"`;
      }
      if (
        !target ||
        target.startsWith("/") ||
        target.startsWith("http") ||
        target.startsWith("mailto:") ||
        target.startsWith("tel:")
      ) {
        return `href="${rawValue}"`;
      }

      const normalizedTarget = target.replace(/^\.\//, "");
      const reservedTarget = reservedLinks[normalizedTarget];
      const rewritten = reservedTarget
        ? reservedEntryLinks.get(reservedTarget) ?? reservedTarget
        : pageLinks.get(normalizedTarget) ??
          (normalizedTarget === "index.html"
            ? getAcademyEntryHref(routeContext, "home")
            : null);
      if (!rewritten) return `href="${rawValue}"`;
      return `href="${rewritten}${hash ? `#${hash}` : ""}"`;
    });

  const announcement = overrides.announcement?.trim();
  if (announcement) {
    output = output.replace(
      /(<main\b[^>]*>)/i,
      `$1<div class="kaimentors-package-announcement">${escapeHtml(
        announcement,
      )}</div>`,
    );
  }

  if (overrides.brokerLink?.trim()) {
    const brokerPage = sitePackage.manifest.pages.find((page) =>
      ["broker", "xm"].includes(page.slug),
    );
    if (brokerPage) {
      const brokerPageHref = getAcademyWebsitePageHref(
        routeContext,
        brokerPage.path,
      );
      output = output.replace(
        new RegExp(`href=["']${escapeRegExp(brokerPageHref)}["']`, "gi"),
        `href="${escapeAttribute(overrides.brokerLink.trim())}"`,
      );
    }
  }

  return output;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadAssignment(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  portalId: string,
) {
  const { data } = await supabase
    .from("custom_site_assignments")
    .select("*,package:custom_site_packages(*)")
    .eq("portal_id", portalId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;

  const row = data as AssignmentRow;
  const sitePackage = Array.isArray(row.package) ? row.package[0] : row.package;
  if (!sitePackage?.is_active) return null;

  return {
    assignment: {
      id: row.id,
      trader_id: row.trader_id,
      portal_id: row.portal_id,
      package_id: row.package_id,
      status: row.status,
      content_overrides: row.content_overrides ?? {},
      show_powered_by: row.show_powered_by,
      assigned_by: row.assigned_by,
      activated_at: row.activated_at,
    },
    package: normalizePackage(sitePackage),
  };
}

async function loadPortalBySlug(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  slug: string,
) {
  const { data } = await supabase
    .from("portals")
    .select(
      "id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,primary_color,accent_color,logo_path,is_published,website_delivery_mode,contact_phone,contact_email,whatsapp_number,telegram_url,instagram_url,facebook_url,youtube_url,twitter_url,tiktok_url,linkedin_url",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  return (data as CustomSitePortal | null) ?? null;
}

async function loadCustomSite(
  portal: CustomSitePortal,
  routePath: string[] | undefined,
  customDomain: boolean,
): Promise<LoadedCustomSite | null> {
  if (portal.website_delivery_mode !== "custom_package") return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const resolvedAssignment = await loadAssignment(supabase, portal.id);
  if (!resolvedAssignment) return null;

  const sitePackage = resolvedAssignment.package;
  const page = pageForPath(sitePackage, routePath ?? []);
  if (!page) return null;

  if (sitePackage.manifest.renderMode === "static_export") {
    return {
      portal,
      package: sitePackage,
      assignment: resolvedAssignment.assignment,
      page,
      title: `${page.label} | ${portal.portal_name}`,
      description: portal.hero_subtitle,
      bodyHtml: "",
      staticExportUrl: `${sitePackage.asset_base_path}/${page.file}`,
      assetBasePath: sitePackage.asset_base_path,
      contactInfo: {
        phone: portal.contact_phone ?? null,
        email: portal.contact_email ?? null,
        whatsapp: portal.whatsapp_number ?? null,
        telegram: portal.telegram_url ?? null,
        instagram: portal.instagram_url ?? null,
        facebook: portal.facebook_url ?? null,
        youtube: portal.youtube_url ?? null,
        twitter: portal.twitter_url ?? null,
        tiktok: portal.tiktok_url ?? null,
        linkedin: portal.linkedin_url ?? null,
      },
    };
  }

  let html: string;
  try {
    html = await readFile(
      safePackageFilePath(sitePackage.asset_base_path, page.file),
      "utf8",
    );
  } catch (err) {
    console.error(
      `[custom-site] Failed to read file for portal "${portal.slug}", page "${page.file}":`,
      err,
    );
    return null;
  }

  return {
    portal,
    package: sitePackage,
    assignment: resolvedAssignment.assignment,
    page,
    title: extractTitle(html, `${page.label} | ${portal.portal_name}`),
    description: extractDescription(html),
    bodyHtml: rewriteHtml(
      html,
      sitePackage,
      resolvedAssignment.assignment.content_overrides,
      portal.slug,
      customDomain,
    ),
    assetBasePath: sitePackage.asset_base_path,
    contactInfo: {
      phone:     portal.contact_phone    ?? null,
      email:     portal.contact_email    ?? null,
      whatsapp:  portal.whatsapp_number  ?? null,
      telegram:  portal.telegram_url     ?? null,
      instagram: portal.instagram_url    ?? null,
      facebook:  portal.facebook_url     ?? null,
      youtube:   portal.youtube_url      ?? null,
      twitter:   portal.twitter_url      ?? null,
      tiktok:    portal.tiktok_url       ?? null,
      linkedin:  portal.linkedin_url     ?? null,
    },
  };
}

export async function loadCustomSiteBySlug(
  slug: string,
  routePath?: string[],
) {
  const supabase = await createClient();
  if (!supabase) return null;
  const portal = await loadPortalBySlug(supabase, slug);
  if (!portal) return null;
  return loadCustomSite(portal, routePath, false);
}

export async function loadCustomSiteByResolution(
  resolution: ResolvedWebsiteDomain,
  routePath?: string[],
) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("portals")
    .select(
      "id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,primary_color,accent_color,logo_path,is_published,website_delivery_mode,contact_phone,contact_email,whatsapp_number,telegram_url,instagram_url,facebook_url,youtube_url,twitter_url,tiktok_url,linkedin_url",
    )
    .eq("id", resolution.portal_id)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;
  return loadCustomSite(data as CustomSitePortal, routePath, true);
}

export async function loadCustomSiteJoinByResolution(
  resolution: ResolvedWebsiteDomain,
): Promise<CustomSiteJoinData | null> {
  const site = await loadCustomSiteByResolution(resolution, []);
  return loadJoinDataFromSite(site);
}

export async function loadCustomSiteJoinBySlug(
  slug: string,
): Promise<CustomSiteJoinData | null> {
  const site = await loadCustomSiteBySlug(slug, []);
  return loadJoinDataFromSite(site);
}

async function loadJoinDataFromSite(
  site: LoadedCustomSite | null,
): Promise<CustomSiteJoinData | null> {
  if (!site) return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase.rpc("get_public_portal_broker_options", {
    target_portal_slug: site.portal.slug,
  });
  const brokers = ((data ?? []) as PublicBrokerOption[]).map((option) => ({
    id: option.broker_id,
    name: option.broker_name,
    slug: option.broker_slug,
    logo_path: option.broker_logo_path,
    connectionId: option.connection_id,
    affiliateLink: option.affiliate_link,
    verificationMethod: option.verification_method,
  }));

  return {
    portal: site.portal,
    package: site.package,
    assignment: site.assignment,
    brokers,
  };
}
