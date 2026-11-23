import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { academyCanConnectGoogleMeet } from "@/lib/academy-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeGoogleCode,
  googleAccountEmail,
  googleOAuthConfigured,
  requestOrigin,
} from "@/lib/google-meet";
import { getMentorWorkspace } from "@/lib/workspace";

const COOKIE = "km_google_oauth";

function finish(origin: string, query: string) {
  const response = NextResponse.redirect(new URL(`/dashboard/live-classes?${query}`, origin));
  response.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.redirect(new URL("/login", origin));
  if (!academyCanConnectGoogleMeet(workspace.studentPortalFeatures)) {
    return finish(origin, "google=error&reason=unavailable");
  }
  if (!googleOAuthConfigured()) {
    return finish(origin, "google=error&reason=not_configured");
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return finish(origin, oauthError === "access_denied" ? "google=error&reason=denied" : "google=error");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const [nonce, traderId] = state.split(".");
  const cookieNonce = (await cookies()).get(COOKIE)?.value;

  if (!code || !nonce || !cookieNonce || cookieNonce !== nonce || traderId !== workspace.traderId) {
    return finish(origin, "google=error&reason=state");
  }

  const token = await exchangeGoogleCode(origin, code);
  if (!token.access_token) return finish(origin, "google=error");
  if (!token.refresh_token) return finish(origin, "google=error&reason=no_refresh");

  const email = await googleAccountEmail(token.access_token);
  const admin = createAdminClient();
  if (!admin) return finish(origin, "google=error&reason=not_configured");

  const { error } = await admin.rpc("upsert_google_calendar_connection", {
    p_trader_id: workspace.traderId,
    p_refresh_token: token.refresh_token,
    p_email: email,
    p_connected_by: workspace.user.id,
    p_scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });

  if (error) return finish(origin, "google=error");
  return finish(origin, "google=connected");
}
