import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (...segments) => readFile(path.join(root, ...segments), "utf8");
const migrationPath = ["supabase", "migrations", "202606210025_protected_courses_curriculum_media_progress.sql"];

test("course migration preserves legacy identities and creates structured curriculum", async () => {
  const migration = await read(...migrationPath);
  assert.match(migration, /create table public\.course_modules/);
  assert.match(migration, /create table public\.lesson_content_blocks/);
  assert.match(migration, /create table public\.lesson_content_block_media/);
  assert.match(migration, /create table public\.course_media/);
  assert.match(migration, /Register legacy storage paths without changing course, lesson, or resource IDs/);
  assert.match(migration, /insert into public\.course_modules[\s\S]*from public\.courses/);
  assert.match(migration, /alter table public\.lessons alter column module_id set not null/);
  assert.doesNotMatch(migration, /delete from public\.(courses|lessons|resources)/i);
  assert.doesNotMatch(migration, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("one authoritative access contract covers all verified, groups, individuals, and one-to-one", async () => {
  const migration = await read(...migrationPath);
  assert.match(migration, /create or replace function public\.can_access_course/);
  assert.match(migration, /c\.access_mode = 'all_verified'/);
  assert.match(migration, /c\.access_mode = 'restricted'/);
  assert.match(migration, /student_group_members/);
  assert.match(migration, /g\.student_user_id = target_user_id/);
  assert.match(migration, /c\.access_mode = 'one_to_one'/);
  assert.match(migration, /one-to-one requires exactly one student/);
  for (const table of ["courses", "lessons", "resources"]) {
    assert.match(migration, new RegExp(`students read accessible published ${table}[\\s\\S]*can_access_course`));
  }
});

test("protected media requires short audited sessions and has no student storage policy", async () => {
  const migration = await read(...migrationPath);
  const sessionRoute = await read("app", "api", "course-media", "[mediaId]", "session", "route.ts");
  assert.match(migration, /expires timestamptz := now\(\)\+interval '5 minutes'/);
  assert.match(migration, /insert into public\.course_media_access_sessions/);
  assert.match(migration, /drop policy if exists "entitled users read tenant course content"/);
  assert.match(migration, /drop policy if exists "tenant members manage course content"/);
  assert.match(migration, /create policy "staff manage protected course content"/);
  assert.doesNotMatch(migration, /create policy[^;]+course content[^;]+for select[^;]+auth\.uid\(\)/i);
  assert.match(sessionRoute, /issue_course_media_session/);
  assert.match(sessionRoute, /createSignedUrl\([^,]+,\s*300\)/);
  assert.match(sessionRoute, /Cache-Control.*no-store/);
});

test("uploads are resumable, direct-to-storage, signature checked, and lifecycle controlled", async () => {
  const library = await read("components", "course-media-library.tsx");
  const initializer = await read("app", "api", "course-media", "route.ts");
  const finalize = await read("app", "api", "course-media", "[mediaId]", "finalize", "route.ts");
  const access = await read("lib", "course-access.ts");
  const migration = await read(...migrationPath);
  assert.match(library, /new Upload\(file/);
  assert.match(library, /removeFingerprintOnSuccess: true/);
  assert.match(initializer, /uploadUrl:[\s\S]*storage\/v1\/upload\/resumable/);
  assert.match(access, /max: 500 \* 1024 \* 1024/);
  assert.doesNotMatch(initializer, /arrayBuffer\(|formData\(/);
  assert.match(finalize, /Range: "bytes=0-31"/);
  assert.match(finalize, /signatureMatches/);
  assert.match(migration, /validate_course_media_transition/);
  assert.match(migration, /replacement media type mismatch/);
  assert.match(migration, /update public\.lesson_content_block_media set media_id=target_new_media_id/);
  assert.match(migration, /processing_state='deletion_blocked'/);
});

test("image galleries use ordered normalized media and transactional block creation", async () => {
  const migration = await read(...migrationPath);
  const route = await read("app", "api", "lessons", "[lessonId]", "blocks", "route.ts");
  const player = await read("components", "protected-lesson-content.tsx");
  assert.match(migration, /create or replace function public\.create_lesson_content_block/);
  assert.match(migration, /gallery requires at least one image/);
  assert.match(migration, /from unnest\(target_media_ids\) with ordinality/);
  assert.match(route, /create_lesson_content_block/);
  assert.match(player, /block\.galleryMedia/);
  assert.match(player, /block_type\s*===\s*"gallery"/);
});

test("a reused media asset resolves an accessible course rather than an arbitrary first reference", async () => {
  const migration = await read(...migrationPath);
  assert.match(migration, /select refs\.course_id into cid/);
  assert.match(migration, /where public\.can_access_course\(refs\.course_id,auth\.uid\(\)\) limit 1/);
  assert.match(migration, /select l\.course_id from public\.lesson_content_block_media/);
});

test("progress is durable, tenant-bound, throttled, and retained through reordering", async () => {
  const migration = await read(...migrationPath);
  const player = await read("components", "protected-lesson-content.tsx");
  const curriculum = await read("app", "api", "courses", "[courseId]", "curriculum", "route.ts");
  assert.match(migration, /unique \(trader_id, student_user_id, lesson_id\)/);
  assert.match(migration, /is_completed=public\.lesson_progress\.is_completed or excluded\.is_completed/);
  assert.match(migration, /first_completed_at=coalesce/);
  assert.match(migration, /Durable per-student progress retained across access loss and curriculum reorder/);
  assert.match(player, /now\s*-\s*lastWrite\.current\s*<\s*15000/);
  assert.match(curriculum, /requiresConfirmation:true/);
  assert.match(curriculum, /Prior completion history will remain/);
});

test("mentor and student course surfaces expose the required operating model", async () => {
  const manager = await read("components", "course-detail-manager.tsx");
  const courseList = await read("components", "course-manager.tsx");
  const studentList = await read("app", "student", "courses", "page.tsx");
  for (const tab of ["Overview", "Curriculum", "Resources", "Access", "Students", "Settings"]) assert.match(manager, new RegExp(`"${tab}"`));
  for (const mode of ["all_verified", "restricted", "one_to_one"]) assert.match(manager, new RegExp(mode));
  assert.match(courseList, /filterStatus|showNewCourse/);
  assert.match(studentList, /My Learning/);
  assert.match(studentList, /Continue Watching/);
  assert.match(studentList, /Completed/);
});

test("production acceptance is acceptance-test scoped, repeatable, and secretless", async () => {
  const runner = await read("scripts", "accept-protected-courses-production.mjs");
  assert.match(runner, /environment.*acceptance_test/);
  assert.match(runner, /portalSlug\s*=\s*"kaitrades"/);
  assert.match(runner, /length === 1/);
  assert.match(runner, /removePreviousFixture/);
  assert.match(runner, /loadClientBaselines/);
  assert.match(runner, /assertClientBaselines/);
  assert.match(runner, /authenticatedClient/);
  assert.match(runner, /signInWithPassword/);
  assert.match(runner, /tusUpload/);
  assert.match(runner, /issue_course_media_session|\/session/);
  assert.match(runner, /finally\s*{\s*await cleanup\(\)/);
  assert.doesNotMatch(runner, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.doesNotMatch(runner, /(?:password|token|key)\s*=\s*["'][^"']+["']/i);
});
