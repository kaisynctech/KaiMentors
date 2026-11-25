import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("custom domains redirect platform /portal/<slug> links to their own root", async () => {
  const middleware = await read("middleware.ts");
  assert.match(middleware, /customDomain && \/\^\\\/portal\\\/\[\^\/\]\+/);
  const strip = (p) => p.replace(/^\/portal\/[^/]+/, "") || "/";
  assert.equal(strip("/portal/bandi-shares"), "/");
  assert.equal(strip("/portal/bandi-shares/xm"), "/xm");
  assert.equal(strip("/portal/pasii/about"), "/about");
});

test("custom domains keep password recovery and account setup on the academy domain", async () => {
  const middleware = await read("middleware.ts");
  assert.doesNotMatch(middleware, /path\.startsWith\("\/recover"\)/);
  assert.doesNotMatch(middleware, /path\.startsWith\("\/account-setup"\)/);
  const login = await read("components/academy-login-page.tsx");
  assert.doesNotMatch(login, /NEXT_PUBLIC_SITE_URL/);
  assert.match(await read("app/domain-sites/[hostname]/recover/page.tsx"), /AcademyAuthShell/);
  assert.match(await read("app/domain-sites/[hostname]/account-setup/page.tsx"), /showWorkspaceLink=\{false\}/);
});

test("platform academy pages send visitors to a live custom domain", async () => {
  for (const file of [
    "app/portal/[slug]/page.tsx",
    "app/portal/[slug]/[pageSlug]/page.tsx",
    "app/portal/[slug]/login/page.tsx",
    "app/portal/[slug]/join-academy/page.tsx",
  ]) {
    assert.match(await read(file), /customDomainUrlForPortal\(/, file);
  }
});

test("package titles are decoded before they reach page metadata", async () => {
  const source = await read("lib/custom-sites.ts");
  assert.match(source, /function decodeHtmlEntities/);
  assert.match(source, /decodeHtmlEntities\(title\)/);
});

test("academy domains publish robots.txt and a sitemap of their own pages", async () => {
  const robots = await read("app/robots.ts");
  assert.match(robots, /academySitemapUrls/);
  assert.match(robots, /"\/dashboard"/);
  const seo = await read("lib/seo.ts");
  assert.match(seo, /isPlatformHostname\(hostname\)/);
  assert.match(seo, /seenFiles\.has\(page\.file\)/);
  assert.match(await read("app/sitemap.ts"), /academySitemapUrls/);
});

test("a missing page on a live academy domain names the academy, not the platform", async () => {
  const notFound = await read("app/domain-sites/[hostname]/not-found.tsx");
  assert.match(notFound, /Page not found/);
  assert.match(notFound, /academy\.portal\.portal_name/);
  const layout = await read("app/domain-sites/[hostname]/layout.tsx");
  assert.match(layout, /Page not found · \$\{data\.portal\.portal_name\}/);
  assert.doesNotMatch(layout, /KaiMentors/);
  const page = await read("app/domain-sites/[hostname]/[[...path]]/page.tsx");
  assert.doesNotMatch(page, /portalTitle\("Academy website"\)/);
});

test("Sharesworldwide pages no longer show the discount placeholder", async () => {
  for (const page of ["index", "services", "xm"]) {
    const html = await read(`public/custom-sites/bandi-shares/v1/${page}.html`);
    assert.doesNotMatch(html, /coming soon from Bandile/, page);
  }
});
