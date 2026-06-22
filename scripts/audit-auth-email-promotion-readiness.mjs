import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadEnvironment() {
  const text = await readFile(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

await loadEnvironment();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: policy, error: policyError } = await admin
  .from("platform_settings")
  .select("value,updated_at")
  .eq("key", "auth_email_delivery_policy")
  .single();
if (policyError) throw policyError;

const { data: applications, error: applicationError } = await admin
  .from("student_applications")
  .select("student_user_id,created_at,trader:traders!inner(environment),portal:portals!inner(slug)")
  .eq("trader.environment", "acceptance_test")
  .eq("portal.slug", "kaitrades")
  .order("created_at", { ascending: false })
  .limit(25);
if (applicationError) throw applicationError;

const userIds = [...new Set((applications ?? []).map((application) => application.student_user_id))];
const { data: events, error: eventError } = userIds.length
  ? await admin
      .from("auth_challenge_events")
      .select("id,user_id,purpose,event_type,created_at")
      .in("user_id", userIds)
      .eq("purpose", "signup")
      .order("created_at", { ascending: false })
  : { data: [], error: null };
if (eventError) throw eventError;

const authStates = [];
for (const userId of userIds) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  authStates.push({
    userId,
    emailConfirmedAt: data.user?.email_confirmed_at ?? null,
    lastSignInAt: data.user?.last_sign_in_at ?? null,
  });
}

console.log(JSON.stringify({
  policy: {
    mode: policy.value?.mode ?? "missing",
    updatedAt: policy.updated_at,
  },
  kaiTradesApplicationCount: applications?.length ?? 0,
  signupEvents: events ?? [],
  authStates,
  verifiedCandidateCount: (events ?? []).filter((event) => event.event_type === "verified").length,
}, null, 2));
