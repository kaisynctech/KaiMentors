export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "trader" | "student";
export type TenantEnvironment = "production" | "acceptance_test";
export type VerificationStatus =
  | "pending"
  | "processing"
  | "verified"
  | "rejected"
  | "manual_review"
  | "needs_more_information";

export type VerificationMethod =
  | "api"
  | "manual_review"
  | "screenshot_upload";

export interface PortalSummary {
  id: string;
  trader_id: string;
  slug: string;
  portal_name: string;
  hero_title: string;
  hero_subtitle: string | null;
  primary_color: string;
  accent_color: string;
  logo_path: string | null;
  cta_label: string;
  broker_cta_label: string;
  welcome_message: string;
  whatsapp_number: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  is_published: boolean;
}

export interface BrokerSummary {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
}

export interface PublicBrokerOption {
  connection_id: string;
  broker_id: string;
  broker_name: string;
  broker_slug: string;
  broker_logo_path: string | null;
  affiliate_link: string | null;
  verification_method: VerificationMethod;
}

export interface StudentBrokerGuide {
  id: string;
  affiliate_link: string | null;
  verification_method: VerificationMethod;
  verification_instructions: string | null;
}
