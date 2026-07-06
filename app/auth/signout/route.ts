import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";

function isSafeRelativeUrl(value: string): boolean {
  return typeof value === "string" && value.startsWith("/") && !value.includes("://");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  // Time-box signOut to 4 s. Under Supabase infrastructure load the call can
  // hang indefinitely — the redirect must happen regardless.
  if (supabase) {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  }

  let returnTo = "/login";
  try {
    const formData = await request.formData();
    const candidate = formData.get("returnTo");
    if (typeof candidate === "string" && isSafeRelativeUrl(candidate)) {
      returnTo = candidate;
    }
  } catch {
    // formData() throws if body is not form-encoded — fall through to default
  }

  // When signing out from a custom domain, /portal/[slug]/login does not exist on
  // that domain. Override returnTo to /login, which middleware rewrites to the
  // portal's own login page.
  try {
    const requestHostname = normalizeRequestHostname(
      new URL(request.url).hostname,
    );
    if (!isPlatformHostname(requestHostname)) {
      returnTo = "/login";
    }
  } catch {
    // leave returnTo as-is
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url));

  // Clear the workspace cookie so the next login always resolves the workspace
  // fresh from the database (memberships[0] by created_at).
  // Without this, a 30-day stale cookie persists across sign-outs and causes
  // the user to land on the wrong workspace after re-login.
  response.cookies.delete("km_workspace");

  return response;
}
