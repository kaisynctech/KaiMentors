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
const eventFlag = process.argv.indexOf("--request-event-id");
const requestEventId = eventFlag >= 0 ? Number(process.argv[eventFlag + 1]) : NaN;
if (!Number.isSafeInteger(requestEventId) || requestEventId < 1) throw new Error("A valid --request-event-id is required.");
if (!process.env.KAIMENTORS_OPERATOR_EMAIL || !process.env.KAIMENTORS_OPERATOR_PASSWORD) {
  throw new Error("Authenticated super-admin operator credentials are required.");
}

const operator = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: signIn, error: signInError } = await operator.auth.signInWithPassword({
  email: process.env.KAIMENTORS_OPERATOR_EMAIL,
  password: process.env.KAIMENTORS_OPERATOR_PASSWORD,
});
if (signInError || !signIn.user) throw new Error("Super-admin authentication failed.");
const { data: profile } = await operator.from("profiles").select("role").eq("id", signIn.user.id).maybeSingle();
if (profile?.role !== "super_admin") throw new Error("The authenticated operator is not a super admin.");

const { data: verifiedEventId, error } = await operator.rpc("reconcile_auth_challenge_verification", {
  target_request_event_id: requestEventId,
});
await operator.auth.signOut();
if (error) throw error;
console.log(JSON.stringify({ requestEventId, verifiedEventId, status: "reconciled" }, null, 2));
