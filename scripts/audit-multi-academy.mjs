import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const text = await readFile(".env.local", "utf8");
for (const line of text.split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const separator = line.indexOf("=");
  process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const emails = ["kaisynctech@gmail.com", "nyaristo01@gmail.com", "nyaradzondoro1@gmail.com"];
const { data: profiles, error: profileError } = await admin.from("profiles").select("id,email,role").in("email", emails);
if (profileError) throw profileError;
const ownerIds = profiles.map((profile) => profile.id);
const { data: traders, error: traderError } = await admin.from("traders").select("id,owner_user_id,legal_name,display_name,environment,status").in("owner_user_id", ownerIds);
if (traderError) throw traderError;
const traderIds = traders.map((trader) => trader.id);
const [{ data: memberships }, { data: portals }, { data: assignments }, { data: domains }, { data: invitations }] = await Promise.all([
  admin.from("trader_members").select("trader_id,user_id,role").in("trader_id", traderIds),
  admin.from("portals").select("id,trader_id,slug,portal_name,website_delivery_mode,is_published").in("trader_id", traderIds),
  admin.from("custom_site_assignments").select("id,trader_id,portal_id,package_id,status,package:custom_site_packages(package_key,version,asset_base_path)").in("trader_id", traderIds),
  admin.from("website_domains").select("id,trader_id,portal_id,hostname,status,is_primary").in("trader_id", traderIds),
  admin.from("academy_invitations").select("id,email,trader_id,status,expires_at").in("trader_id", traderIds),
]);
const tenantTables = ["student_applications", "verification_attempts", "trader_broker_accounts", "courses", "resources", "student_groups", "student_group_members", "conversations", "messages", "website_pages", "website_sections", "website_releases", "audit_logs"];
const counts = {};
for (const table of tenantTables) {
  const { data, error } = await admin.from(table).select("trader_id").in("trader_id", traderIds);
  if (error) { counts[table] = { error: error.code }; continue; }
  counts[table] = Object.fromEntries(traderIds.map((id) => [id, data.filter((row) => row.trader_id === id).length]));
}
console.log(JSON.stringify({ profiles, traders, memberships, portals, assignments, domains, invitations, counts }, null, 2));
