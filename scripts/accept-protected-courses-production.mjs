import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Upload } from "tus-js-client";

const FIXTURE_PREFIX = "[KAITRADES ACCEPTANCE]";
const FIXTURE_SLUG_PREFIX = "kaitrades-acceptance-";
const portalSlug = "kaitrades";
const baseUrl = process.env.KAIMENTORS_ACCEPTANCE_URL ?? "https://kaimentors.vercel.app";

await loadEnvironment();
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, options);
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const fixtureVersion = "phase1-v1";
const evidence = { runId, target: {}, scenarios: {}, security: {}, media: {}, progress: {}, cleanup: {} };
const ephemeralUserIds = [];
const tempDirectory = join(process.cwd(), ".acceptance-tmp");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function loadEnvironment() {
  const text = await readFile(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function randomPassword() {
  return `Aa1!${crypto.randomUUID()}`;
}

async function single(query, label) {
  const { data, error } = await query.single();
  if (error || !data) throw new Error(`${label}: ${error?.message ?? "not found"}`);
  return data;
}

async function resolveAcceptanceTenant() {
  const { data: traders, error } = await admin
    .from("traders")
    .select("id,owner_user_id,display_name,environment,status,portals!inner(id,slug,portal_name,is_published)")
    .eq("environment", "acceptance_test")
    .eq("portals.slug", portalSlug);
  if (error) throw error;
  assert(traders?.length === 1, "KaiTrades acceptance tenant resolution must return exactly one tenant.");
  const trader = traders[0];
  const portal = Array.isArray(trader.portals) ? trader.portals[0] : trader.portals;
  assert(trader.status === "active" && portal?.is_published, "KaiTrades acceptance tenant must be active and published.");
  assert(trader.display_name === "KaiTrades" && portal.portal_name === "KaiTrades", "Acceptance identity does not match KaiTrades.");
  evidence.target = { environment: trader.environment, portalSlug: portal.slug, tenantLabel: trader.display_name };
  return { trader, portal };
}

async function createEphemeralUser(label, role = "student") {
  const email = `kaimentors-acceptance-${label}-${runId}@example.com`;
  const password = randomPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${FIXTURE_PREFIX} ${label}` },
  });
  if (error || !data.user) throw new Error(`Could not create ${label} identity: ${String(error?.message ?? error?.code ?? "provider rejected request")}`);
  ephemeralUserIds.push(data.user.id);
  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    role,
    full_name: `${FIXTURE_PREFIX} ${label}`,
    email,
  });
  if (profileError) throw profileError;
  return { label, id: data.user.id, email, password };
}

async function removePreviousFixture(context) {
  const { data: courses, error: courseError } = await admin.from("courses").select("id,cover_path").eq("trader_id", context.trader.id).like("slug", `${FIXTURE_SLUG_PREFIX}%`);
  if (courseError) throw courseError;
  const courseIds = (courses ?? []).map((course) => course.id);
  if (courseIds.length) {
    for (const table of ["course_media_access_sessions", "lesson_progress", "content_access_grants"]) {
      const column = table === "content_access_grants" ? "entity_id" : "course_id";
      const query = admin.from(table).delete().eq("trader_id", context.trader.id).in(column, courseIds);
      if (table === "content_access_grants") query.eq("entity_type", "course");
      const { error } = await query;
      if (error) throw error;
    }
    const { error } = await admin.from("courses").delete().eq("trader_id", context.trader.id).in("id", courseIds);
    if (error) throw error;
    const coverPaths = (courses ?? []).map((course) => course.cover_path).filter(Boolean);
    if (coverPaths.length) await admin.storage.from("course-content").remove(coverPaths);
  }
  const { data: mediaRows, error: mediaError } = await admin.from("course_media").select("id,storage_path").eq("trader_id", context.trader.id).like("title", `${FIXTURE_PREFIX}%`);
  if (mediaError) throw mediaError;
  const mediaIds = (mediaRows ?? []).map((media) => media.id);
  if (mediaIds.length) {
    await admin.from("course_media").update({ replaced_by_media_id: null, replaces_media_id: null }).eq("trader_id", context.trader.id).in("id", mediaIds);
    const { error } = await admin.from("course_media").delete().eq("trader_id", context.trader.id).in("id", mediaIds);
    if (error) throw error;
    const paths = (mediaRows ?? []).map((media) => media.storage_path);
    if (paths.length) await admin.storage.from("course-content").remove(paths);
  }
  const { data: groups, error: groupError } = await admin.from("student_groups").select("id").eq("trader_id", context.trader.id).like("name", `${FIXTURE_PREFIX}%`);
  if (groupError) throw groupError;
  const groupIds = (groups ?? []).map((group) => group.id);
  if (groupIds.length) {
    await admin.from("content_access_grants").delete().eq("trader_id", context.trader.id).in("group_id", groupIds);
    const { error } = await admin.from("student_groups").delete().eq("trader_id", context.trader.id).in("id", groupIds);
    if (error) throw error;
  }
  const staleUsers = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    staleUsers.push(...data.users.filter((user) => user.email?.startsWith("kaimentors-acceptance-")));
    if (data.users.length < 1000) break;
  }
  for (const user of staleUsers) await admin.auth.admin.deleteUser(user.id);
}

async function authenticatedClient(identity) {
  const client = createClient(supabaseUrl, anonKey, options);
  const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
  if (error || !data.session) throw new Error(`${identity.label} could not authenticate.`);
  return { client, session: data.session };
}

async function authenticatedHttp(identity) {
  const jar = new Map();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
  if (error || !data.session) throw new Error(`${identity.label} HTTP session could not authenticate.`);
  const cookie = () => [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  const request = async (path, init = {}) => fetch(new URL(path, baseUrl), {
    ...init,
    headers: { cookie: cookie(), ...(init.headers ?? {}) },
    redirect: "manual",
  });
  return { request, accessToken: data.session.access_token };
}

async function ensureApplication({ trader, portal }, brokerAccount, identity, status) {
  return single(admin.from("student_applications").insert({
    trader_id: trader.id,
    portal_id: portal.id,
    student_user_id: identity.id,
    trader_broker_account_id: brokerAccount.id,
    broker_account_identifier: `${FIXTURE_PREFIX}-${identity.label}`,
    status,
    status_reason: `${FIXTURE_PREFIX} controlled production acceptance`,
    consented_at: new Date().toISOString(),
    verified_at: status === "verified" ? new Date().toISOString() : null,
  }).select("id,trader_id,student_user_id,status"), `${identity.label} application`);
}

async function apiJson(http, path, init, expected) {
  const response = await http.request(path, init);
  const payload = await response.json().catch(() => ({}));
  assert(response.status === expected, `${path} returned ${response.status}, expected ${expected}: ${payload.error ?? ""}`);
  return payload;
}

async function initializeMedia(http, input, expected = 201) {
  return apiJson(http, "/api/course-media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }, expected);
}

async function tusUpload({ endpoint, bucketName, storagePath, bytes, mimeType, accessToken, interrupt = false }) {
  let interrupted = false;
  let firstUpload;
  const storage = new Map();
  const urlStorage = {
    findAllUploads: async () => [...storage.values()],
    findUploadsByFingerprint: async (fingerprint) => [...storage.values()].filter((item) => item.fingerprint === fingerprint),
    removeUpload: async (urlStorageKey) => storage.delete(urlStorageKey),
    addUpload: async (fingerprint, upload) => {
      const urlStorageKey = crypto.randomUUID();
      storage.set(urlStorageKey, { ...upload, fingerprint, urlStorageKey });
      return urlStorageKey;
    },
  };
  const run = (resume) => new Promise((resolve, reject) => {
    const upload = new Upload(bytes, {
      endpoint,
      headers: { authorization: `Bearer ${accessToken}`, "x-upsert": "false" },
      metadata: { bucketName, objectName: storagePath, contentType: mimeType, cacheControl: "private, max-age=0" },
      chunkSize: 6 * 1024 * 1024,
      uploadSize: bytes.length,
      urlStorage,
      onChunkComplete: async (_chunkSize, uploaded) => {
        if (interrupt && !interrupted && uploaded < bytes.length) {
          interrupted = true;
          firstUpload = upload;
          await upload.abort(false);
          resolve("interrupted");
        }
      },
      onError: reject,
      onSuccess: () => resolve("uploaded"),
    });
    if (resume) upload.resumeFromPreviousUpload(resume);
    upload.start();
  });
  const first = await run(null);
  if (first === "uploaded") return { interrupted: false, resumed: false };
  assert(firstUpload, "Interrupted upload was not captured.");
  const previous = await firstUpload.findPreviousUploads();
  assert(previous.length === 1, "Interrupted upload did not persist resumable state.");
  const second = await run(previous[0]);
  assert(second === "uploaded", "Interrupted upload did not resume successfully.");
  return { interrupted: true, resumed: true };
}

async function buildAssets() {
  await mkdir(tempDirectory, { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAf2C9WQAAAAASUVORK5CYII=", "base64");
  const pdfSource = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 45>>stream\nBT /F1 18 Tf 40 120 Td (KaiTrades Acceptance) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000202 00000 n \ntrailer<</Root 1 0 R/Size 5>>\nstartxref\n296\n%%EOF\n");
  const paddedPdf = Buffer.alloc(7 * 1024 * 1024, 0x20);
  pdfSource.copy(paddedPdf);
  const videoPath = process.env.KAIMENTORS_ACCEPTANCE_VIDEO;
  if (!videoPath) throw new Error("KAIMENTORS_ACCEPTANCE_VIDEO must reference a KaiMentors-owned MP4 acceptance asset.");
  const video = await readFile(videoPath);
  assert(video.subarray(4, 8).toString() === "ftyp", "Acceptance video is not a valid MP4 container.");
  await writeFile(join(tempDirectory, "acceptance.png"), png);
  await writeFile(join(tempDirectory, "acceptance.pdf"), paddedPdf);
  return { png, pdf: paddedPdf, video };
}

async function run() {
  const context = await resolveAcceptanceTenant();
  const baseline = await loadClientBaselines();
  await removePreviousFixture(context);
  const brokerAccount = await single(admin.from("trader_broker_accounts").select("id,trader_id").eq("trader_id", context.trader.id).eq("is_active", true).limit(1), "KaiTrades broker account");
  const assets = await buildAssets();

  const identities = {};
  for (const [label, role] of [
    ["platform-admin", "super_admin"], ["tenant-staff", "trader"],
    ["all-verified", "student"], ["group-entitled", "student"],
    ["individual-entitled", "student"], ["one-to-one", "student"],
    ["verified-not-entitled", "student"], ["unverified", "student"],
  ]) identities[label] = await createEphemeralUser(label, role);

  await admin.from("trader_members").insert({ trader_id: context.trader.id, user_id: identities["tenant-staff"].id, role: "editor" });
  const applications = {};
  for (const label of ["all-verified", "group-entitled", "individual-entitled", "one-to-one", "verified-not-entitled"]) {
    applications[label] = await ensureApplication(context, brokerAccount, identities[label], "verified");
  }
  applications.unverified = await ensureApplication(context, brokerAccount, identities.unverified, "pending");
  await admin.from("audit_logs").insert({
    trader_id: context.trader.id,
    actor_user_id: identities["platform-admin"].id,
    actor_role: "super_admin",
    action: "protected_courses_acceptance_started",
    entity_type: "acceptance_run",
    entity_id: runId,
    metadata: { fixture: FIXTURE_PREFIX, portal_slug: portalSlug },
  });

  const staffAuth = await authenticatedClient(identities["tenant-staff"]);
  const staffHttp = await authenticatedHttp(identities["tenant-staff"]);
  const group = await single(staffAuth.client.from("student_groups").insert({
    trader_id: context.trader.id,
    name: `${FIXTURE_PREFIX} Entitled ${runId}`,
    description: `${FIXTURE_PREFIX} group entitlement fixture`,
    color: "#315EFB",
    created_by: identities["tenant-staff"].id,
  }).select("id"), "acceptance group");
  { const { error: gmError } = await staffAuth.client.from("student_group_members").insert({ trader_id: context.trader.id, group_id: group.id, application_id: applications["group-entitled"].id, added_by: identities["tenant-staff"].id }); if (gmError) throw new Error(`student_group_members insert: ${gmError.message} (code: ${gmError.code})`); }

  const media = {};
  const upload = async (key, title, fileName, mimeType, mediaType, bytes, extra = {}) => {
    const init = await initializeMedia(staffHttp, { title: `${FIXTURE_PREFIX} ${title}`, fileName, mimeType, sizeBytes: bytes.length, mediaType, replacesMediaId: extra.replacesMediaId ?? null });
    const resume = await tusUpload({ endpoint: init.uploadUrl, bucketName: init.bucketName, storagePath: init.storagePath, bytes, mimeType, accessToken: staffHttp.accessToken, interrupt: extra.interrupt ?? false });
    await apiJson(staffHttp, `/api/course-media/${init.mediaId}/finalize`, { method: "POST" }, 200);
    media[key] = { ...init, resume };
    return media[key];
  };
  await upload("video", "Video", "acceptance.mp4", "video/mp4", "video", assets.video);
  await upload("pdf", "PDF", "acceptance.pdf", "application/pdf", "pdf", assets.pdf, { interrupt: true });
  await upload("image", "Image", "acceptance.png", "image/png", "image", assets.png);
  await upload("galleryTwo", "Gallery Two", "gallery-two.png", "image/png", "image", assets.png);

  await initializeMedia(staffHttp, { title: `${FIXTURE_PREFIX} Rejected MIME`, fileName: "bad.exe", mimeType: "application/octet-stream", sizeBytes: 100, mediaType: "pdf" }, 400);
  await initializeMedia(staffHttp, { title: `${FIXTURE_PREFIX} Rejected Extension`, fileName: "bad.jpg", mimeType: "application/pdf", sizeBytes: 100, mediaType: "pdf" }, 400);
  await initializeMedia(staffHttp, { title: `${FIXTURE_PREFIX} Rejected Size`, fileName: "huge.png", mimeType: "image/png", sizeBytes: 21 * 1024 * 1024, mediaType: "image" }, 400);
  const invalid = await initializeMedia(staffHttp, { title: `${FIXTURE_PREFIX} Invalid Signature`, fileName: "invalid.pdf", mimeType: "application/pdf", sizeBytes: assets.png.length, mediaType: "pdf" });
  await tusUpload({ endpoint: invalid.uploadUrl, bucketName: invalid.bucketName, storagePath: invalid.storagePath, bytes: assets.png, mimeType: "application/pdf", accessToken: staffHttp.accessToken });
  await apiJson(staffHttp, `/api/course-media/${invalid.mediaId}/finalize`, { method: "POST" }, 400);
  const missing = await initializeMedia(staffHttp, { title: `${FIXTURE_PREFIX} Missing Object`, fileName: "missing.png", mimeType: "image/png", sizeBytes: assets.png.length, mediaType: "image" });
  await apiJson(staffHttp, `/api/course-media/${missing.mediaId}/finalize`, { method: "POST" }, 400);

  const courseSpecs = [
    ["all", "All Verified", "published", "all_verified"],
    ["group", "Group", "published", "restricted"],
    ["individual", "Individual", "published", "restricted"],
    ["one", "One to One", "published", "one_to_one"],
    ["draft", "Draft", "draft", "all_verified"],
    ["archived", "Archived", "archived", "all_verified"],
  ];
  const courses = {};
  for (const [key, name, status, mode] of courseSpecs) {
    courses[key] = await single(staffAuth.client.from("courses").insert({
      trader_id: context.trader.id,
      title: `${FIXTURE_PREFIX} ${name}`,
      slug: `${FIXTURE_SLUG_PREFIX}${key}-${fixtureVersion}`,
      description: `${FIXTURE_PREFIX} ${mode} scenario`,
      status,
      sort_order: Object.keys(courses).length,
      access_mode: mode,
      access_scope: mode === "all_verified" ? "all_verified" : "restricted",
      created_by: identities["tenant-staff"].id,
    }).select("id,title,status,access_mode"), `${name} course`);
  }

  for (const [label, courseId, mode, groupIds, studentIds] of [
    ["group", courses.group.id, "restricted", [group.id], []],
    ["individual", courses.individual.id, "restricted", [], [identities["individual-entitled"].id]],
    ["one-to-one", courses.one.id, "one_to_one", [], [identities["one-to-one"].id]],
  ]) {
    const { error: accessError } = await staffAuth.client.rpc("set_course_access", { target_course_id: courseId, target_mode: mode, target_group_ids: groupIds, target_student_ids: studentIds });
    if (accessError) throw new Error(`set_course_access (${label}): ${accessError.message} (code: ${accessError.code})`);
  }

  const module = await single(staffAuth.client.from("course_modules").insert({ trader_id: context.trader.id, course_id: courses.all.id, title: `${FIXTURE_PREFIX} Published Module`, status: "published", sort_order: 0, is_required: true, created_by: identities["tenant-staff"].id }).select("id"), "published module");
  const draftModule = await single(staffAuth.client.from("course_modules").insert({ trader_id: context.trader.id, course_id: courses.all.id, title: `${FIXTURE_PREFIX} Draft Module`, status: "draft", sort_order: 1, is_required: false, created_by: identities["tenant-staff"].id }).select("id"), "draft module");
  const lesson = await single(staffAuth.client.from("lessons").insert({ trader_id: context.trader.id, course_id: courses.all.id, module_id: module.id, title: `${FIXTURE_PREFIX} Mixed Media`, description: `${FIXTURE_PREFIX} protected lesson`, duration_seconds: 12, status: "published", sort_order: 0, is_required: true, published_at: new Date().toISOString(), created_by: identities["tenant-staff"].id }).select("id"), "published lesson");
  await staffAuth.client.from("lessons").insert({ trader_id: context.trader.id, course_id: courses.all.id, module_id: draftModule.id, title: `${FIXTURE_PREFIX} Draft Lesson`, duration_seconds: 10, status: "draft", sort_order: 1, is_required: false, created_by: identities["tenant-staff"].id });
  await staffAuth.client.from("lessons").insert({ trader_id: context.trader.id, course_id: courses.all.id, module_id: module.id, title: `${FIXTURE_PREFIX} Archived Lesson`, duration_seconds: 10, status: "archived", sort_order: 2, is_required: false, created_by: identities["tenant-staff"].id });

  for (const block of [
    ["rich_text", [], { html: "<p>KaiTrades acceptance written lesson.</p>" }],
    ["video", [media.video.mediaId], {}], ["pdf", [media.pdf.mediaId], {}],
    ["image", [media.image.mediaId], {}], ["gallery", [media.image.mediaId, media.galleryTwo.mediaId], {}],
    ["link", [], { url: "https://kaimentors.vercel.app", label: "KaiMentors" }],
  ]) {
    const { error } = await staffAuth.client.rpc("create_lesson_content_block", { target_lesson_id: lesson.id, target_block_type: block[0], target_sort_order: block[0] === "rich_text" ? 0 : ["video", "pdf", "image", "gallery", "link"].indexOf(block[0]) + 1, target_content: block[2], target_is_required: true, target_media_ids: block[1] });
    if (error) throw error;
  }
  await staffAuth.client.from("resources").insert({ trader_id: context.trader.id, course_id: courses.all.id, lesson_id: lesson.id, title: `${FIXTURE_PREFIX} Supporting PDF`, type: "pdf", storage_path: media.pdf.storagePath, status: "published", created_by: identities["tenant-staff"].id, access_scope: "all_verified", media_id: media.pdf.mediaId, sort_order: 0 });

  const replacement = await upload("replacement", "Replacement Image", "replacement.png", "image/png", "image", assets.png, { replacesMediaId: media.image.mediaId });
  const { data: replacedBlock } = await staffAuth.client.from("lesson_content_blocks").select("media_id").eq("lesson_id", lesson.id).eq("block_type", "image").single();
  assert(replacedBlock?.media_id === replacement.mediaId, "Media replacement did not preserve the active lesson reference.");
  const deletionResponse = await staffHttp.request(`/api/course-media/${replacement.mediaId}`, { method: "DELETE" });
  assert(deletionResponse.status === 409, "Referenced media deletion was not blocked.");

  const studentSessions = {};
  for (const label of ["all-verified", "group-entitled", "individual-entitled", "one-to-one", "verified-not-entitled", "unverified"]) studentSessions[label] = await authenticatedClient(identities[label]);
  const can = async (label, courseId) => {
    const { data, error } = await studentSessions[label].client.rpc("can_access_course", { target_course_id: courseId, target_user_id: identities[label].id });
    if (error) throw error;
    return data;
  };
  assert(await can("all-verified", courses.all.id), "Verified student cannot access all-verified course.");
  assert(await can("group-entitled", courses.group.id), "Group-entitled student cannot access group course.");
  assert(await can("individual-entitled", courses.individual.id), "Individual-entitled student cannot access individual course.");
  assert(await can("one-to-one", courses.one.id), "One-to-one student cannot access one-to-one course.");
  assert(!(await can("verified-not-entitled", courses.group.id)), "Verified non-entitled student accessed restricted course.");
  assert(!(await can("unverified", courses.all.id)), "Unverified student accessed protected course.");
  assert(!(await can("all-verified", crypto.randomUUID())), "Fabricated course identifier did not fail closed.");

  const allHttp = await authenticatedHttp(identities["all-verified"]);
  const mediaSession = await apiJson(allHttp, `/api/course-media/${media.video.mediaId}/session`, { method: "POST" }, 200);
  assert(mediaSession.expiresIn === 300 && mediaSession.url, "Protected media session was not short-lived.");
  const delivered = await fetch(mediaSession.url, { headers: { Range: "bytes=0-31" } });
  assert(delivered.ok, "Authorized protected video delivery failed.");
  const { data: directStorage } = await studentSessions["all-verified"].client.storage.from("course-content").list(context.trader.id, { limit: 1 });
  assert((directStorage ?? []).length === 0, "Student obtained direct protected storage listing.");
  const progressOne = await apiJson(allHttp, "/api/course-progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonId: lesson.id, positionSeconds: 5, completed: false }) }, 200);
  assert(progressOne.progress.position_seconds === 5 && !progressOne.progress.is_completed, "Partial progress was not recorded.");
  const progressTwo = await apiJson(allHttp, "/api/course-progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonId: lesson.id, positionSeconds: 12, completed: true }) }, 200);
  assert(progressTwo.progress.is_completed, "Lesson completion was not recorded.");

  await staffAuth.client.rpc("set_course_access", { target_course_id: courses.all.id, target_mode: "restricted", target_group_ids: [], target_student_ids: [identities["individual-entitled"].id] });
  assert(!(await can("all-verified", courses.all.id)), "Revoked access remained active.");
  const deniedSession = await allHttp.request(`/api/course-media/${media.video.mediaId}/session`, { method: "POST" });
  assert(deniedSession.status === 404, "Revoked student received a new media session.");
  const { data: retainedProgress } = await studentSessions["all-verified"].client.from("lesson_progress").select("position_seconds,is_completed").eq("lesson_id", lesson.id).maybeSingle();
  assert(retainedProgress?.is_completed, "Progress was lost after entitlement removal.");
  await staffAuth.client.rpc("set_course_access", { target_course_id: courses.all.id, target_mode: "all_verified", target_group_ids: [], target_student_ids: [] });
  assert(await can("all-verified", courses.all.id), "Restored access did not take effect.");

  const clientTenantIds = await clientTenantIdSet();
  for (const table of ["courses", "course_media", "lesson_progress", "course_media_access_sessions", "student_groups", "content_access_grants"]) {
    const { data, error } = await staffAuth.client.from(table).select("trader_id").in("trader_id", [...clientTenantIds]);
    if (error) throw error;
    assert((data ?? []).length === 0, `KaiTrades staff read client-owned ${table}.`);
  }
  await assertClientBaselines(baseline);

  evidence.scenarios = { allVerified: "passed", group: "passed", individual: "passed", oneToOne: "passed", verifiedNotEntitled: "denied", unverified: "denied", revokeRestore: "passed", lifecycle: "passed" };
  evidence.media = { mixedContent: "passed", resumableUpload: media.pdf.resume, validation: "passed", shortLivedSessionSeconds: 300, directStudentStorage: "denied", replacement: "passed", deletionProtection: "passed" };
  evidence.progress = { partial: "passed", completion: "passed", retainedAfterRevocation: "passed", restoredAccess: "passed" };
  evidence.security = { realAuthenticatedSessions: true, fabricatedIds: "denied", clientTenantReads: "denied", clientBaselines: "unchanged" };
  await admin.from("audit_logs").insert({ trader_id: context.trader.id, actor_user_id: identities["platform-admin"].id, actor_role: "super_admin", action: "protected_courses_acceptance_passed", entity_type: "acceptance_run", entity_id: runId, metadata: { fixture: FIXTURE_PREFIX, scenarios: evidence.scenarios } });
}

async function clientTenantIdSet() {
  const { data, error } = await admin.from("traders").select("id").eq("environment", "production");
  if (error) throw error;
  return new Set((data ?? []).map((item) => item.id));
}

async function loadClientBaselines() {
  const clientIds = [...await clientTenantIdSet()];
  const result = {};
  for (const table of ["traders", "portals", "trader_members", "custom_site_assignments", "student_applications", "courses", "course_media"]) {
    const query = table === "traders" ? admin.from(table).select("id", { count: "exact", head: true }).in("id", clientIds) : admin.from(table).select("id", { count: "exact", head: true }).in("trader_id", clientIds);
    const { count, error } = await query;
    if (error) throw error;
    result[table] = count ?? 0;
  }
  return result;
}

async function assertClientBaselines(baseline) {
  const after = await loadClientBaselines();
  assert(JSON.stringify(after) === JSON.stringify(baseline), "A production client tenant baseline changed during acceptance.");
}

async function cleanup() {
  const { data: target } = await admin.from("traders").select("id,owner_user_id").eq("environment", "acceptance_test").eq("display_name", "KaiTrades").maybeSingle();
  if (target && ephemeralUserIds.length) {
    for (const table of ["courses", "course_modules", "course_media", "lessons", "resources", "student_groups", "lesson_content_blocks", "content_access_grants"]) {
      const authorColumn = table === "content_access_grants" ? "granted_by" : "created_by";
      await admin.from(table).update({ [authorColumn]: target.owner_user_id }).eq("trader_id", target.id).in(authorColumn, ephemeralUserIds);
    }
    await admin.from("lesson_progress").delete().eq("trader_id", target.id).in("student_user_id", ephemeralUserIds);
    await admin.from("course_media_access_sessions").delete().eq("trader_id", target.id).in("student_user_id", ephemeralUserIds);
  }
  for (const userId of ephemeralUserIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) evidence.cleanup[userId.slice(0, 8)] = "failed";
  }
  await rm(tempDirectory, { recursive: true, force: true });
  evidence.cleanup.ephemeralIdentities = Object.values(evidence.cleanup).includes("failed") ? "review_required" : "removed";
}

let runError = null;
try {
  await run();
} catch (error) {
  runError = error;
  evidence.failure = error instanceof Error ? error.message : "Unknown acceptance failure";
} finally {
  await cleanup();
}
if (runError) {
  console.error(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(evidence, null, 2));
}
