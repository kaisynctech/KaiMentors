import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (...segments) => readFile(path.join(root, ...segments), "utf8");

// ── verification-screenshot API ──────────────────────────────────────────────

test("verification-screenshot route rejects without auth and validates path ownership", async () => {
  const route = await read("app", "api", "student", "verification-screenshot", "route.ts");
  // Must auth before touching DB
  assert.match(route, /getUser/);
  assert.match(route, /401/);
  // Path regex must require UUID/UUID/resubmission shape
  assert.match(route, /resubmission/);
  assert.match(route, /\.regex\(/);
  // Validates that the student path segment matches the authenticated user
  assert.match(route, /pathStudentId.*user\.id|user\.id.*pathStudentId/);
});

test("verification-screenshot route only allows resubmission when status is manual_review", async () => {
  const route = await read("app", "api", "student", "verification-screenshot", "route.ts");
  assert.match(route, /manual_review/);
  // Must check application status before writing
  assert.match(route, /status.*manual_review|manual_review.*status/);
  // Must not accept screenshot from pending/processing/verified/rejected applications
  assert.doesNotMatch(route, /status.*\b(pending|verified|rejected)\b.*update/i);
});

test("verification-screenshot route verifies trader_id from DB, not browser", async () => {
  const route = await read("app", "api", "student", "verification-screenshot", "route.ts");
  // trader_id must come from the looked-up application, not the request body
  assert.match(route, /application\.trader_id/);
  // Path traderId segment must be compared against DB trader_id
  assert.match(route, /pathTraderId/);
  assert.match(route, /pathSegments\[0\]/);
  // portalId comes from body but is validated against the found application
  assert.match(route, /portal_id/);
});

test("verification-screenshot route uses admin client for the write and emits audit log", async () => {
  const route = await read("app", "api", "student", "verification-screenshot", "route.ts");
  // Must use admin client for the privileged update
  assert.match(route, /createAdminClient/);
  // Must write audit log
  assert.match(route, /audit_logs/);
  assert.match(route, /student\.verification_screenshot\.submitted/);
});

test("verification-screenshot client uploads to verification-proofs bucket, no service-role key", async () => {
  const upload = await read("components", "verification-screenshot-upload.tsx");
  // Client uploads directly to the correct bucket via browser supabase client
  assert.match(upload, /verification-proofs/);
  // Resubmission path is constructed from traderId + studentUserId
  assert.match(upload, /resubmission/);
  // Must not contain service-role key literal
  assert.doesNotMatch(upload, /eyJ[A-Za-z0-9_-]{20,}/);
  // Route API call uses fetch, not admin client
  assert.match(upload, /\/api\/student\/verification-screenshot/);
});

// ── broker accounts PATCH extension ─────────────────────────────────────────

test("broker PATCH accepts verificationInstructions, affiliateLink, partnerCode as optional fields", async () => {
  const route = await read("app", "api", "brokers", "accounts", "route.ts");
  assert.match(route, /verificationInstructions.*optional|optional.*verificationInstructions/);
  assert.match(route, /affiliateLink.*optional|optional.*affiliateLink/);
  assert.match(route, /partnerCode.*optional|optional.*partnerCode/);
  // Must build updatePayload dynamically — only set fields that were supplied
  assert.match(route, /updatePayload/);
  assert.match(route, /Object\.keys\(updatePayload\)/);
});

test("broker PATCH is tenant-scoped and never touches another trader's account", async () => {
  const route = await read("app", "api", "brokers", "accounts", "route.ts");
  // update must filter on trader_id coming from the server-side membership lookup
  assert.match(route, /\.eq\("trader_id", workspace\.traderId\)/);
  // Must not accept traderId from the request body
  const updateSchemaBlock = route.slice(route.indexOf("updateSchema"), route.indexOf("updateSchema") + 600);
  assert.doesNotMatch(updateSchemaBlock, /traderId|trader_id/);
});

test("broker PATCH emits audit log when verificationInstructions changes", async () => {
  const route = await read("app", "api", "brokers", "accounts", "route.ts");
  assert.match(route, /broker_account\.verification_instructions\.updated/);
  assert.match(route, /audit_logs/);
  // Audit log is conditional on verificationInstructions being present in the payload
  assert.match(route, /verificationInstructions !== undefined/);
});

// ── student shell security invariants ───────────────────────────────────────

test("StudentShell server component uses admin client for signed URL, never exposes bucket to browser", async () => {
  const shell = await read("components", "student-shell.tsx");
  assert.match(shell, /createAdminClient/);
  assert.match(shell, /portal-branding/);
  assert.match(shell, /createSignedUrl/);
  // The signed URL is passed as a prop string — the bucket name and path stay server-side
  assert.match(shell, /logoUrl/);
  // Must not import createBrowserClient or expose admin client to JSX
  assert.doesNotMatch(shell, /createBrowserClient/);
});

test("partner_code is never returned to the student client under any code path", async () => {
  const rpc = await read("supabase", "migrations", "202606240028_student_portal_schema.sql");
  // get_student_broker_guide must NOT select partner_code
  const fnBlock = rpc.slice(rpc.indexOf("get_student_broker_guide"), rpc.indexOf("$$ language plpgsql") + 50);
  assert.doesNotMatch(fnBlock, /partner_code/);
  // Student dashboard page must not reference partner_code
  const page = await read("app", "student", "page.tsx");
  assert.doesNotMatch(page, /partner_code/);
});

test("ContentGate maps manual_review to 'More information needed', not 'being reviewed'", async () => {
  const gate = await read("components", "content-gate.tsx");
  assert.match(gate, /manual_review/);
  assert.match(gate, /[Mm]ore information/);
  assert.doesNotMatch(gate, /being reviewed/);
});

test("KSI student plans are Library R99, Scholar R149, and Studio R249", async () => {
  const plans = await read("lib", "subscription-plans.ts");
  const subscribe = await read("app", "api", "student", "subscribe", "route.ts");
  const pricing = await read("public", "custom-sites", "kaisync-institution", "v1", "pricing.html");
  assert.match(plans, /id: "library"/);
  assert.match(plans, /amountZAR: 99/);
  assert.match(plans, /id: "scholar"/);
  assert.match(plans, /amountZAR: 149/);
  assert.match(plans, /id: "studio"/);
  assert.match(plans, /amountZAR: 249/);
  assert.match(plans, /freeOneToOnePerMonth: 1/);
  assert.match(plans, /oneToOnePriceZAR: 49/);
  assert.match(plans, /sundayBusinessSeminar: true/);
  assert.match(plans, /2 AI seminars a week/);
  assert.doesNotMatch(plans, /id: "basic"/);
  assert.match(subscribe, /PLAN_IDS/);
  assert.match(pricing, /R99/);
  assert.match(pricing, /R149/);
  assert.match(pricing, /R249/);
  assert.match(pricing, />Studio</);
  assert.doesNotMatch(pricing, /R700/);
  assert.doesNotMatch(pricing, /R250/);
  assert.doesNotMatch(pricing, /countdown/);
  assert.match(pricing, /All five recorded courses/);
  assert.match(pricing, /builder keeps 90%/);
  assert.match(pricing, /2 AI seminars a week/);
  assert.match(pricing, /Sunday business seminar/);
  assert.match(pricing, /R49 \/ 45 min/);
  assert.match(pricing, /one on one session/);
  assert.doesNotMatch(pricing, /1:1/);
  assert.doesNotMatch(pricing, /live lab/);
  assert.doesNotMatch(pricing, /clinic/);
});

test("KaiSync Institution public site describes the open catalog", async () => {
  const index = await read("public", "custom-sites", "kaisync-institution", "v1", "index.html");
  const courses = await read("public", "custom-sites", "kaisync-institution", "v1", "courses.html");
  const about = await read("public", "custom-sites", "kaisync-institution", "v1", "about.html");
  assert.match(index, /KaiSync Institution/);
  assert.match(index, /Basic AI/);
  assert.match(index, /Build a website, beginning to end/);
  assert.match(index, /Automation/);
  assert.match(index, /Marketing with AI/);
  assert.match(index, /Applications/);
  assert.match(index, /Join more than one/);
  assert.doesNotMatch(index, /live-count/);
  assert.doesNotMatch(index, /Websites with AI/);
  assert.doesNotMatch(index, /Basic Gaming/);
  assert.match(courses, /A catalog of recordings/);
  assert.match(courses, /Nothing is locked behind another course/);
  assert.match(about, /KaiSync Institution/);
  assert.match(about, /Studio showcase/);
});

test("KaiSync Institution nav has Projects dropdown and Refer a friend", async () => {
  const index = await read("public", "custom-sites", "kaisync-institution", "v1", "index.html");
  const main = await read("public", "custom-sites", "kaisync-institution", "v1", "projects.html");
  const sub = await read("public", "custom-sites", "kaisync-institution", "v1", "sub-projects.html");
  const refer = await read("public", "custom-sites", "kaisync-institution", "v1", "refer.html");
  const appJs = await read("public", "custom-sites", "kaisync-institution", "v1", "app.js");
  assert.match(index, /nav-dropdown/);
  assert.match(index, /Main projects/);
  assert.match(index, /Sub projects/);
  assert.match(index, /Refer a friend/);
  assert.match(main, /data-project-kind="main"/);
  assert.match(main, /Finished work. Ready to sell/);
  assert.match(sub, /data-project-kind="sub"/);
  assert.match(sub, /still need to be finished off/);
  assert.match(refer, /Refer a client/);
  assert.match(appJs, /data-dropdown-toggle/);
  assert.match(appJs, /Enquire to buy/);
});

test("mentors can play academy videos without student verification and students can see published resources", async () => {
  const session = await read("lib", "student-access-server.ts");
  const resources = await read("app", "student", "resources", "page.tsx");
  const mentorResources = await read("components", "mentor-resources.tsx");
  const migration = await read(
    "supabase",
    "migrations",
    "20261002120000_staff_play_and_resource_access.sql",
  );
  assert.match(session, /is_trader_member/);
  assert.match(session, /hasModuleAccess: true/);
  assert.match(resources, /access_scope", "all_students"/);
  assert.match(resources, /isAcademyStaff/);
  assert.doesNotMatch(
    resources,
    /if \(!hasModuleAccess\) \{\s*return \(/,
  );
  assert.match(mentorResources, /defaultValue="all_students"/);
  assert.match(migration, /is_trader_member\(target_trader_id\)/);
  assert.match(migration, /is_trader_member\(c\.trader_id\)/);
});

test("verification-screenshot upload client never receives service-role key", async () => {
  const upload = await read("components", "verification-screenshot-upload.tsx");
  // Must use browser client, not admin
  assert.match(upload, /createBrowserClient|createClient/);
  assert.doesNotMatch(upload, /createAdminClient/);
  // No hardcoded keys
  assert.doesNotMatch(upload, /eyJ[A-Za-z0-9_-]{20,}/);
  // File type validation present
  assert.match(upload, /jpeg|png|webp/i);
});

test("migration adds verification_instructions and screenshot_path columns", async () => {
  const migration = await read("supabase", "migrations", "202606240028_student_portal_schema.sql");
  assert.match(migration, /verification_instructions/);
  assert.match(migration, /verification_screenshot_path/);
  // Must be SECURITY DEFINER for the broker guide RPC
  assert.match(migration, /security definer/i);
  // Storage policies must scope to resubmission path
  assert.match(migration, /resubmission/);
});
