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

  return NextResponse.redirect(new URL(returnTo, request.url));
}
