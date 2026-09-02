import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  isPortalFeatureEnabled,
  mentorNavHrefsForFeatures,
  resolvePortalFeatures,
  sanitizePortalFeatureMap,
} from "../lib/portal-features.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (...segments) => readFile(path.join(root, ...segments), "utf8");

test("empty portal features keep core academy modules on", () => {
  const verification = resolvePortalFeatures({}, "verification");
  assert.equal(verification.courses, true);
  assert.equal(verification.community, true);
  assert.equal(verification.live_classes, true);
  assert.equal(verification.bookings, true);
  assert.equal(verification.groups, true);
  assert.equal(verification.messages, true);
  assert.equal(verification.resources, true);
  assert.equal(verification.projects, false);
  assert.equal(verification.broker, true);

  const subscription = resolvePortalFeatures({}, "subscription");
  assert.equal(subscription.courses, true);
  assert.equal(subscription.projects, false);
  assert.equal(subscription.broker, false);
});

test("explicit false hides the same module for mentor and student", () => {
  const stored = { community: false, bookings: false };
  assert.equal(isPortalFeatureEnabled(stored, "community", "verification"), false);
  assert.equal(isPortalFeatureEnabled(stored, "bookings", "verification"), false);
  assert.equal(isPortalFeatureEnabled(stored, "courses", "verification"), true);

  const hrefs = mentorNavHrefsForFeatures(stored, "verification");
  assert.equal(hrefs.has("/dashboard/community"), false);
  assert.equal(hrefs.has("/dashboard/bookings"), false);
  assert.equal(hrefs.has("/dashboard/courses"), true);
  assert.equal(hrefs.has("/dashboard/projects"), false);
});

test("KaiTrades-style full map keeps every catalog module on", () => {
  const kaitrades = {
    courses: true,
    community: true,
    live_classes: true,
    bookings: true,
    groups: true,
    messages: true,
    resources: true,
    projects: true,
    broker: true,
  };
  const resolved = resolvePortalFeatures(kaitrades, "verification");
  assert.deepEqual(resolved, kaitrades);
  assert.equal(sanitizePortalFeatureMap(kaitrades)?.courses, true);
  assert.equal(sanitizePortalFeatureMap({ courses: true }), null);
});

test("mentor save path and student nav both read the portal feature map", async () => {
  const api = await read("app", "api", "portal", "features", "route.ts");
  const settings = await read("app", "dashboard", "settings", "page.tsx");
  const panel = await read("components", "portal-features-settings.tsx");
  const dashboardShell = await read("components", "dashboard-shell.tsx");
  const studentShell = await read("components", "student-shell-client.tsx");
  const studentCommunity = await read("app", "student", "community", "page.tsx");
  const mentorCommunity = await read("app", "dashboard", "community", "page.tsx");
  const mentorProjects = await read("app", "dashboard", "projects", "page.tsx");
  const studentProjects = await read("app", "student", "projects", "page.tsx");
  const publicProjects = await read("app", "api", "public", "student-projects", "route.ts");
  const migration = await read(
    "supabase",
    "migrations",
    "20260901160000_kaitrades_portal_features.sql",
  );
  const projectsMigration = await read(
    "supabase",
    "migrations",
    "20260901180000_student_projects_tenant_scope.sql",
  );

  assert.match(api, /student_portal_features/);
  assert.match(api, /portal\.features_updated/);
  assert.match(settings, /PortalFeaturesSettings/);
  assert.match(settings, /tab === "features"/);
  assert.match(panel, /\/api\/portal\/features/);
  assert.match(panel, /Students see the same modules/);
  assert.match(dashboardShell, /MENTOR_NAV_FEATURE_BY_HREF/);
  assert.match(dashboardShell, /usePortalFeatures/);
  assert.match(studentShell, /featureKey: "community"/);
  assert.match(studentShell, /portalFeatures\[item\.featureKey\]/);
  assert.match(studentCommunity, /isPortalFeatureEnabled/);
  assert.match(studentCommunity, /"community"/);
  assert.match(mentorCommunity, /isPortalFeatureEnabled/);
  assert.match(mentorCommunity, /"community"/);
  assert.match(dashboardShell, /\/dashboard\/projects/);
  assert.match(studentShell, /featureKey: "projects"/);
  assert.match(mentorProjects, /"projects"/);
  assert.match(studentProjects, /"projects"/);
  assert.match(publicProjects, /portal=.*kaisync-institution|isPortalSlug/);
  assert.match(migration, /slug = 'kaitrades'/);
  assert.match(migration, /'courses', true/);
  assert.match(migration, /'broker', true/);
  assert.match(projectsMigration, /trader_id/);
  assert.match(projectsMigration, /kaisync-institution/);
  assert.match(projectsMigration, /kaitrades/);
});
