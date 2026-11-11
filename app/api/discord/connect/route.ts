import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SHARESWORLDWIDE_SLUG,
  discordAuthorizeUrl,
  discordConfig,
  discordRedirectUri,
  discordStateExpiry,
  signDiscordState,
  type DiscordLinkRole,
} from "@/lib/discord";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeReturn(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function withDiscordNotice(path: string, code: string) {
  return `${path}${path.includes("?") ? "&" : "?"}discord=${code}`;
}

export async function GET(request: Request) {
  const config = discordConfig();
  const origin = new URL(request.url).origin;
  const requestedReturn = safeReturn(new URL(request.url).searchParams.get("returnTo"), "/dashboard/settings?tab=integration");
  if (!config.configured) {
    return NextResponse.redirect(new URL(withDiscordNotice(requestedReturn, "not_configured"), origin));
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabase || !admin || !secret) {
    return NextResponse.redirect(new URL(withDiscordNotice(requestedReturn, "unavailable"), origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  const { data: portal } = await admin
    .from("portals")
    .select("trader_id")
    .eq("slug", SHARESWORLDWIDE_SLUG)
    .maybeSingle();
  if (!portal?.trader_id) {
    return NextResponse.redirect(new URL(withDiscordNotice(requestedReturn, "unavailable"), origin));
  }

  const { data: membership } = await admin
    .from("trader_members")
    .select("user_id")
    .eq("trader_id", portal.trader_id)
    .eq("user_id", user.id)
    .maybeSingle();

  let role: DiscordLinkRole | null = membership ? "mentor" : null;
  if (!role) {
    const { data: application } = await admin
      .from("student_applications")
      .select("id")
      .eq("trader_id", portal.trader_id)
      .eq("student_user_id", user.id)
      .neq("status", "rejected")
      .maybeSingle();
    if (application) role = "student";
  }
  if (!role) return NextResponse.redirect(new URL(withDiscordNotice(requestedReturn, "not_allowed"), origin));

  const returnTo = role === "mentor" ? "/dashboard/settings?tab=integration" : requestedReturn;
  const state = signDiscordState({
    traderId: portal.trader_id,
    userId: user.id,
    role,
    returnTo,
    exp: discordStateExpiry(),
  }, secret);

  const cookieStore = await cookies();
  cookieStore.set("discord_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/api/discord",
    maxAge: 600,
  });

  return NextResponse.redirect(discordAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: discordRedirectUri(origin),
    state,
    role,
  }));
}
