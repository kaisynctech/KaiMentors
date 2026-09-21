import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (...segments) => readFile(path.join(root, ...segments), "utf8");

test("affiliate mismatch copy names the mentor and is XM-specific", async () => {
  const copy = await read("lib", "broker-verify-copy.ts");
  assert.match(copy, /This XM ID is not registered under this mentor/);
  assert.match(copy, /This account number is not registered under this mentor/);
  assert.match(copy, /You cannot leave this blank/);
});

test("XM ID is required on the student verify form for every XM academy", async () => {
  const form = await read("components", "verify-account-form.tsx");
  assert.match(form, /requiredAccountNumberMessage\(isXm\)/);
  assert.match(form, /required/);
  assert.match(form, /You must enter it/);
  assert.match(form, /payload\.status === "mismatch"/);
  assert.match(form, /affiliateMismatchMessage\(isXm\)/);
});

test("verify API returns mismatch and does not overwrite to manual review", async () => {
  const route = await read("app", "api", "student", "verify", "route.ts");
  assert.match(route, /status: "mismatch"/);
  assert.match(route, /AFFILIATE_MISMATCH/);
  assert.match(route, /mismatchResponse/);
  assert.match(route, /accountNumber: z\.string\(\)\.trim\(\)\.min\(3\)/);
  const mismatchIndex = route.indexOf('result.status === "mismatch"');
  const step7Index = route.indexOf("Step 7");
  assert.ok(mismatchIndex > 0 && step7Index > mismatchIndex);
  assert.match(route.slice(mismatchIndex, step7Index), /return mismatchResponse/);
});

test("broker verify edge function keeps mismatch applications pending", async () => {
  const fn = await read("supabase", "functions", "verify-broker-account", "index.ts");
  assert.match(fn, /AFFILIATE_MISMATCH/);
  assert.match(fn, /responseStatus = isMismatch \? "mismatch" : attemptStatus/);
  assert.match(fn, /isMismatch\s*\n\s*\? "pending"/);
});

test("student dashboard explains mismatch instead of generic review copy", async () => {
  const page = await read("app", "student", "page.tsx");
  assert.match(page, /AFFILIATE_MISMATCH/);
  assert.match(page, /This account is not registered under this mentor/);
  assert.match(page, /affiliateMismatchMessage\(isXmAcademy\)/);
});

test("student search RPC includes broker_account_identifier for every workspace", async () => {
  const migration = await read(
    "supabase",
    "migrations",
    "20260921170000_student_search_broker_account_identifier.sql",
  );
  assert.match(migration, /application\.broker_account_identifier/);
  assert.match(migration, /profile\.full_name/);
  assert.match(migration, /position\(/);
});

test("mentor student list searches as you type and has a Search button", async () => {
  const list = await read("components", "student-review-list.tsx");
  assert.match(list, /setTimeout/);
  assert.match(list, /type="submit"/);
  assert.match(list, />\s*Search\s*</);
  const page = await read("app", "dashboard", "students", "page.tsx");
  assert.match(page, /broker_account_identifier/);
  assert.match(page, /postgrestSearchNeedle/);
});
