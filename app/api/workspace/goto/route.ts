import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const traderId = searchParams.get("traderId");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!traderId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const dashboardUrl = new URL(next, request.url);
  const response = NextResponse.redirect(dashboardUrl);
  response.cookies.set("km_workspace", traderId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
