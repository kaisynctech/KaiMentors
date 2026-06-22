import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function args() {
  const result = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    result[process.argv[index]?.replace(/^--/, "")] = process.argv[index + 1];
  }
  return result;
}

async function loadEnvironment() {
  const text = await readFile(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

await loadEnvironment();
const input = args();
for (const required of ["email", "full-name", "legal-name", "display-name", "slug", "package-key", "invited-by"]) {
  if (!input[required]) throw new Error(`Missing --${required}`);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = input.email.toLowerCase();
const { data: actor, error: actorError } = await admin.from("profiles").select("id,role").ilike("email", input["invited-by"]).maybeSingle();
if (actorError) throw actorError;
if (actor?.role !== "super_admin") throw new Error("Inviting platform owner was not found.");
const { data: sitePackage } = await admin.from("custom_site_packages").select("id,package_key,version").eq("package_key", input["package-key"]).eq("is_active", true).order("version", { ascending: false }).limit(1).maybeSingle();
if (!sitePackage) throw new Error("Active custom package was not found.");
const [{ data: existingProfile }, { data: existingPortal }] = await Promise.all([
  admin.from("profiles").select("id").ilike("email", email).maybeSingle(),
  admin.from("portals").select("id").eq("slug", input.slug).maybeSingle(),
]);
if (existingProfile || existingPortal) throw new Error("Owner or academy slug already exists; duplicate provisioning refused.");

const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: { full_name: input["full-name"], role: "trader", invited_by: actor.id } });
if (createError || !created.user) throw createError ?? new Error("Auth user creation failed.");
const userId = created.user.id;
const { data: provisioned, error: provisionError } = await admin.rpc("provision_invited_academy", { target_user_id: userId, target_email: email, target_full_name: input["full-name"], target_legal_name: input["legal-name"], target_display_name: input["display-name"], target_slug: input.slug, target_package_id: sitePackage.id, target_environment: input.environment ?? "production", target_invited_by: actor.id, target_timezone: input.timezone ?? "Africa/Johannesburg" });
if (provisionError || !provisioned) {
  await admin.auth.admin.deleteUser(userId);
  throw provisionError ?? new Error("Atomic workspace provisioning failed.");
}
console.log(JSON.stringify({ userId, ...provisioned, packageId: sitePackage.id, otpRequired: true }, null, 2));
