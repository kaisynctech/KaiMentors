import type { PublicBrokerOption } from "@/lib/database.types";

export type WebsiteSectionType =
  | "hero"
  | "about"
  | "features"
  | "courses"
  | "testimonials"
  | "community"
  | "cta"
  | "faq"
  | "contact"
  | "join_academy";

export interface WebsiteTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string;
  thumbnail_path: string | null;
  category: string;
  is_active: boolean;
  version: number;
  blueprint: Record<string, unknown>;
  owner_trader_id?: string | null;
  visibility?: "public" | "tenant";
  renderer_key?: string;
  editable_schema?: Record<string, unknown>;
  is_managed?: boolean;
}

export interface WebsitePage {
  id: string;
  trader_id: string;
  portal_id: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_home: boolean;
  is_enabled: boolean;
  seo_title: string | null;
  seo_description: string | null;
}

export interface WebsiteSection {
  id: string;
  trader_id: string;
  page_id: string;
  section_key: string;
  section_type: WebsiteSectionType;
  variant: string;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
  sort_order: number;
  is_enabled: boolean;
}

export interface WebsiteTheme {
  id: string;
  trader_id: string;
  portal_id: string;
  template_id: string;
  logo_path: string | null;
  hero_image_path: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  surface_color: string;
  text_color: string;
  heading_font: string;
  body_font: string;
  social_links: Record<string, string>;
  custom_settings: Record<string, unknown>;
}

export interface WebsiteNavigationItem {
  id: string;
  trader_id: string;
  portal_id: string;
  page_id: string | null;
  label: string;
  href: string | null;
  location: "header" | "footer";
  sort_order: number;
  is_enabled: boolean;
  open_in_new_tab: boolean;
}

export interface WebsitePortal {
  id: string;
  trader_id: string;
  slug: string;
  portal_name: string;
  hero_title: string;
  hero_subtitle: string | null;
  welcome_message: string;
  whatsapp_number: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  primary_color: string;
  accent_color: string;
  logo_path: string | null;
  cta_label: string;
  broker_cta_label: string;
  is_published: boolean;
}

export interface WebsiteCourse {
  id: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  coverUrl: string | null;
}

export interface WebsiteBroker {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  connectionId: string;
  affiliateLink: string | null;
  verificationMethod: PublicBrokerOption["verification_method"];
}

export interface WebsiteData {
  portal: WebsitePortal;
  template: WebsiteTemplate;
  theme: WebsiteTheme;
  pages: WebsitePage[];
  sections: WebsiteSection[];
  navigation: WebsiteNavigationItem[];
  courses: WebsiteCourse[];
  brokers: WebsiteBroker[];
}

export function getWebsiteMediaUrl(path: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !path) return null;
  return `${url}/storage/v1/object/public/website-media/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
