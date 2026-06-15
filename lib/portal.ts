import type {
  BrokerSummary,
  PortalSummary,
  PublicBrokerOption,
} from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export async function getPublishedPortal(slug: string): Promise<{
  portal: PortalSummary;
  brokers: BrokerSummary[];
} | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: portal } = await supabase
    .from("portals")
    .select(
      "id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,whatsapp_number,telegram_url,instagram_url,primary_color,accent_color,logo_path,cta_label,broker_cta_label,is_published",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!portal) return null;

  const { data: options } = await supabase.rpc(
    "get_public_portal_broker_options",
    { target_portal_slug: slug },
  );
  const brokers = ((options ?? []) as PublicBrokerOption[]).map((option) => ({
    id: option.broker_id,
    name: option.broker_name,
    slug: option.broker_slug,
    logo_path: option.broker_logo_path,
  })) as BrokerSummary[];

  return { portal: portal as PortalSummary, brokers };
}
