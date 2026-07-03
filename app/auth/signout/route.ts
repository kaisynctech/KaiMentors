import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isSafeRelativeUrl(value: string): boolean {
  return typeof value === "string" && value.startsWith("/") && !value.includes("://");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();

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

  const response = NextResponse.redirect(new URL(returnTo, request.url));

  // Clear the workspace cookie so the next login always resolves the workspace
  // fresh from the database (memberships[0] by created_at).
  // Without this, a 30-day stale cookie persists across sign-outs and causes
  // the user to land on the wrong workspace after re-login.
  response.cookies.delete("km_workspace");

  return response;
}
