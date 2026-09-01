import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  getAcademyEntryHref,
  getAcademyWebsitePageHref,
} from "../lib/academy-routes.ts";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(
  workspaceRoot,
  "public",
  "custom-sites",
  "kaitrades",
  "v1",
);

test("platform academy routes retain the KaiTrades portal context", () => {
  const context = { portalSlug: "kaitrades", customDomain: false };
  assert.equal(
    getAcademyEntryHref(context, "join-academy"),
    "/portal/kaitrades/join-academy",
  );
  assert.equal(
    getAcademyEntryHref(context, "login"),
    "/portal/kaitrades/login",
  );
  assert.equal(
    getAcademyEntryHref(context, "academy"),
    "/student?portal=kaitrades",
  );
  assert.equal(
    getAcademyWebsitePageHref(context, "/signals"),
    "/portal/kaitrades/signals",
  );
});

test("custom-domain academy routes remain domain-relative", () => {
  const context = { portalSlug: "kaitrades", customDomain: true };
  assert.equal(getAcademyEntryHref(context, "join-academy"), "/join-academy");
  assert.equal(getAcademyEntryHref(context, "login"), "/login");
  assert.equal(getAcademyEntryHref(context, "academy"), "/academy");
  assert.equal(getAcademyWebsitePageHref(context, "/signals"), "/signals");
});

test("KaiTrades student login destinations never use fake login paths", async () => {
  const {
    getStudentLoginHref,
    honourMentorNext,
    honourStudentNext,
    isFakeStudentLoginPath,
    studentHomeHref,
  } = await import("../lib/academy-routes.ts");

  assert.equal(studentHomeHref("kaitrades", false), "/student?portal=kaitrades");
  assert.equal(studentHomeHref("kaitrades", true), "/academy");
  assert.equal(
    getStudentLoginHref({ basePath: "/student", portalSlug: "kaitrades" }),
    "/portal/kaitrades/login",
  );
  assert.equal(
    getStudentLoginHref({ basePath: "/academy", portalSlug: "kaitrades" }),
    "/login",
  );

  assert.equal(
    honourStudentNext("/student/courses", "kaitrades", false),
    "/student/courses?portal=kaitrades",
  );
  assert.equal(
    honourStudentNext("/student?portal=kaitrades", "kaitrades", false),
    "/student?portal=kaitrades",
  );
  assert.equal(
    honourStudentNext("/student?portal=pasii", "kaitrades", false),
    null,
  );
  assert.equal(
    honourStudentNext("/dashboard", "kaitrades", false),
    null,
  );
  assert.equal(
    honourStudentNext("/student/login", "kaitrades", false),
    "/student?portal=kaitrades",
  );
  assert.equal(
    honourStudentNext("/academy/courses", "kaitrades", true),
    "/academy/courses",
  );
  assert.equal(honourStudentNext("/login", "kaitrades", true), "/academy");
  assert.equal(honourStudentNext("/student", "kaitrades", true), "/academy");

  assert.equal(
    honourMentorNext("/api/workspace/goto?traderId=abc"),
    "/api/workspace/goto?traderId=abc",
  );
  assert.equal(honourMentorNext("/dashboard"), "/dashboard");
  assert.equal(honourMentorNext("/admin"), "/admin");
  assert.equal(honourMentorNext("/student?portal=kaitrades"), null);
  assert.equal(honourMentorNext("/academy"), null);
  assert.equal(honourMentorNext("/login"), null);
  assert.equal(honourMentorNext("/portal/kaitrades/login"), null);
  assert.equal(honourMentorNext("https://evil.example/login"), null);

  assert.equal(isFakeStudentLoginPath("/student/login"), true);
  assert.equal(isFakeStudentLoginPath("/academy/login"), true);
  assert.equal(isFakeStudentLoginPath("/portal/kaitrades/login"), false);
  assert.equal(isFakeStudentLoginPath("/login"), false);
});

test("login surfaces no longer dump students onto a fake or portal-less home", async () => {
  const loginForm = await readFile(
    path.join(workspaceRoot, "components", "login-form.tsx"),
    "utf8",
  );
  const loginPage = await readFile(
    path.join(workspaceRoot, "app", "login", "page.tsx"),
    "utf8",
  );
  const academyLogin = await readFile(
    path.join(workspaceRoot, "components", "academy-login-page.tsx"),
    "utf8",
  );
  const middleware = await readFile(
    path.join(workspaceRoot, "middleware.ts"),
    "utf8",
  );
  const verifyForm = await readFile(
    path.join(workspaceRoot, "components", "verify-account-form.tsx"),
    "utf8",
  );
  const registrationForm = await readFile(
    path.join(workspaceRoot, "components", "student-registration-form.tsx"),
    "utf8",
  );
  const destinationHelper = await readFile(
    path.join(workspaceRoot, "lib", "student-destination.ts"),
    "utf8",
  );

  assert.doesNotMatch(loginForm, /studentDestination\s*=\s*"\/student"/);
  assert.match(loginForm, /resolvePlatformLoginDestination/);
  assert.match(loginForm, /honourStudentNext/);
  assert.match(loginPage, /resolvePlatformLoginDestination/);
  assert.doesNotMatch(loginPage, /role === "student" \? "\/student"/);
  assert.match(academyLogin, /next=\{safeNext\}/);
  assert.match(academyLogin, /honourStudentNext/);
  assert.match(middleware, /isFakeStudentLoginPath/);
  assert.match(middleware, /lookupLatestStudentPortalSlug/);
  assert.doesNotMatch(middleware, /nextTarget = "\/student"/);
  assert.doesNotMatch(verifyForm, /\/student\$\{querySuffix\}/);
  assert.match(verifyForm, /studentHome/);
  assert.doesNotMatch(registrationForm, /studentDestination = "\/student"/);
  assert.match(registrationForm, /studentHomeHref\(portalSlug\)/);
  assert.match(destinationHelper, /resolvePlatformLoginDestination/);
  assert.match(destinationHelper, /honourMentorNext\(next\) \?\? "\/dashboard"/);
  assert.match(destinationHelper, /honourMentorNext\(next\) \?\? "\/admin"/);
  assert.match(destinationHelper, /userBelongsToPortal/);
});

test("KaiTrades package has independent assets and no client-specific content", async () => {
  const entries = await readdir(fixtureRoot, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const relativePaths = files.map((entry) =>
    path.relative(fixtureRoot, path.join(entry.parentPath, entry.name)),
  );

  assert(relativePaths.includes(path.join("assets", "kaitrades-logo.svg")));
  assert(!relativePaths.includes(path.join("assets", "tc-logo.png")));
  assert(!relativePaths.includes("login.html"));
  assert(!relativePaths.includes("signup.html"));

  const textFiles = files.filter((entry) =>
    [".css", ".html", ".js", ".svg"].includes(path.extname(entry.name)),
  );
  const content = (
    await Promise.all(
      textFiles.map((entry) => readFile(path.join(entry.parentPath, entry.name), "utf8")),
    )
  ).join("\n");

  assert.doesNotMatch(
    content,
    /Traders Confidence|tradersconfidence|Bongani|MD415|xm\.com|tc-logo/i,
  );
  assert.doesNotMatch(content, /<form\b/i);
});

test("fixture migration is slug-scoped and never embeds tenant UUIDs", async () => {
  const migration = await readFile(
    path.join(
      workspaceRoot,
      "supabase",
      "migrations",
      "202606180014_kaitrades_acceptance_test_fixture.sql",
    ),
    "utf8",
  );

  assert.match(migration, /package_key\s*=\s*'kaitrades'/);
  assert.match(migration, /portal\.slug\s*=\s*'kaitrades'/);
  assert.doesNotMatch(
    migration,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.portals[\s\S]*traders-confidence/i,
  );
});

test("multi-academy migrations establish core pages without tenant UUIDs", async () => {
  const migration = await readFile(path.join(workspaceRoot, "supabase", "migrations", "202606180016_multi_academy_core_foundation.sql"), "utf8");
  assert.match(migration, /alter column website_delivery_mode set default 'core_page'/);
  assert.match(migration, /lower\(email\) = 'nyaristo01@gmail\.com'/);
  assert.match(migration, /complete_trader_ownership_transfer/);
  assert.doesNotMatch(migration, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("branded login enforces the requested academy membership", async () => {
  const loginForm = await readFile(path.join(workspaceRoot, "components", "login-form.tsx"), "utf8");
  assert.match(loginForm, /\.eq\("trader_id", academyTraderId\)/);
  assert.match(loginForm, /not registered for this academy/);
});

test("mentor website routes are legacy redirects and domains require super admin", async () => {
  const builderPage = await readFile(path.join(workspaceRoot, "app", "dashboard", "website-builder", "page.tsx"), "utf8");
  const domainApi = await readFile(path.join(workspaceRoot, "app", "api", "website-builder", "domains", "route.ts"), "utf8");
  const builderApi = await readFile(path.join(workspaceRoot, "app", "api", "website-builder", "route.ts"), "utf8");
  assert.match(builderPage, /redirect\("\/dashboard\/branding"\)/);
  assert.match(domainApi, /profile\?\.role !== "super_admin"/);
  assert.match(builderApi, /requirePlatformAdminApi/);
});
