import "server-only";
import type { PublicBrokerOption } from "@/lib/database.types";
import type { ResolvedWebsiteDomain } from "@/lib/domains/resolution";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";
import { createClient } from "@/lib/supabase/server";

export interface AcademyEntryPortal {
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
  website_delivery_mode: "core_page" | "builder_template" | "custom_package" | "external_website";
  academy_description?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  telegram_url?: string | null;
  instagram_url?: string | null;
  contact_phone?: string | null;
  facebook_url?:  string | null;
  youtube_url?:   string | null;
  twitter_url?:   string | null;
  tiktok_url?:    string | null;
  linkedin_url?:  string | null;
  risk_disclosure_enabled?: boolean;
  risk_disclosure?: { title: string; message: string } | null;
}

export interface AcademyEntryBroker {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  connectionId: string;
  affiliateLink: string | null;
  verificationMethod: PublicBrokerOption["verification_method"];
}

export interface AcademyEntryContext {
  portal: AcademyEntryPortal;
  brokers: AcademyEntryBroker[];
  canonicalHostname?: string;
  shouldRedirect?: boolean;
}

const portalSelect =
  "id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,primary_color,accent_color,logo_path,cta_label,broker_cta_label,is_published,website_delivery_mode,academy_description,contact_email,whatsapp_number,telegram_url,instagram_url,contact_phone,facebook_url,youtube_url,twitter_url,tiktok_url,linkedin_url,risk_disclosure_enabled,risk_disclosure:risk_disclosure_templates(title,message)";

function mapBrokerOptions(options: PublicBrokerOption[]): AcademyEntryBroker[] {
  return options.map((option) => ({
    id: option.broker_id,
    name: option.broker_name,
    slug: option.broker_slug,
    logo_path: option.broker_logo_path,
    connectionId: option.connection_id,
    affiliateLink: option.affiliate_link,
    verificationMethod: option.verification_method,
  }));
}

async function loadBrokers(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  portalSlug: string,
) {
  const { data } = await supabase.rpc("get_public_portal_broker_options", {
    target_portal_slug: portalSlug,
  });
  return mapBrokerOptions((data ?? []) as PublicBrokerOption[]);
}

async function loadEntryFromPortal(
  portal: AcademyEntryPortal | null,
): Promise<AcademyEntryContext | null> {
  if (!portal?.is_published) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  return {
    portal,
    brokers: await loadBrokers(supabase, portal.slug),
  };
}

export async function loadAcademyEntryBySlug(
  slug: string,
): Promise<AcademyEntryContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("portals")
    .select(portalSelect)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  return loadEntryFromPortal((data as AcademyEntryPortal | null) ?? null);
}

export async function loadAcademyEntryByResolution(
  resolution: ResolvedWebsiteDomain,
): Promise<AcademyEntryContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("portals")
    .select(portalSelect)
    .eq("id", resolution.portal_id)
    .eq("is_published", true)
    .maybeSingle();

  const entry = await loadEntryFromPortal((data as AcademyEntryPortal | null) ?? null);
  if (!entry) return null;
  return {
    ...entry,
    canonicalHostname: resolution.canonical_hostname,
    shouldRedirect: resolution.should_redirect,
  };
}

export async function loadAcademyEntryByHostname(hostname: string) {
  const resolution = await resolveWebsiteDomain(hostname);
  if (!resolution) return null;
  return loadAcademyEntryByResolution(resolution);
}
