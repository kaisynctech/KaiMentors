import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const text = await readFile(".env.local", "utf8");
for (const line of text.split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const separator = line.indexOf("=");
  process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase verification environment is incomplete.");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);
const protectedTables = [
  "course_modules",
  "course_media",
  "lesson_content_blocks",
  "lesson_content_block_media",
  "lesson_progress",
  "course_media_access_sessions",
];

const counts = {};
for (const table of protectedTables) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} unavailable: ${error.code}`);
  counts[table] = count ?? 0;
}

const { data: bucket, error: bucketError } = await admin.storage.getBucket("course-content");
if (bucketError || !bucket) throw new Error("course-content bucket is unavailable.");
if (bucket.public) throw new Error("course-content bucket must remain private.");
if (bucket.file_size_limit !== 524288000) throw new Error("course-content bucket limit differs from application validation.");

for (const table of ["course_media", "lesson_progress", "course_media_access_sessions"]) {
  const { data, error } = await anonymous.from(table).select("id").limit(1);
  if (error && error.code !== "42501") throw new Error(`Anonymous RLS probe failed for ${table}: ${error.code}`);
  if ((data ?? []).length !== 0) throw new Error(`Anonymous access exposed ${table}.`);
}

const randomId = crypto.randomUUID();
const { data: canAccess, error: accessError } = await admin.rpc("can_access_course", {
  target_course_id: randomId,
  target_user_id: randomId,
});
if (accessError || canAccess !== false) throw new Error("can_access_course deployment verification failed.");

const { error: sessionError } = await admin.rpc("issue_course_media_session", { target_media_id: randomId });
if (!sessionError) throw new Error("Service role unexpectedly executed the student media-session RPC.");

const [{ count: traderCount, error: traderError }, { count: courseCount, error: courseError }] = await Promise.all([
  admin.from("traders").select("*", { count: "exact", head: true }),
  admin.from("courses").select("*", { count: "exact", head: true }),
]);
if (traderError || courseError) throw new Error("Tenant integrity counts could not be read.");

console.log(JSON.stringify({
  migration: "202606210025",
  protectedTables: counts,
  courseContentBucket: { public: bucket.public, fileSizeLimit: bucket.file_size_limit },
  anonymousProtectedReads: "denied",
  serviceRoleMediaSessionBypass: "denied",
  canAccessUnknownCourse: canAccess,
  tenantCounts: { traders: traderCount ?? 0, courses: courseCount ?? 0 },
}, null, 2));
