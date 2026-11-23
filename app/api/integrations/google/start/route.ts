import { NextResponse } from "next/server";
import { academyCanConnectGoogleMeet } from "@/lib/academy-charts";
import { googleAuthUrl, googleOAuthConfigured, requestOrigin } from "@/lib/google-meet";
import { getMentorWorkspace } from "@/lib/workspace";

const COOKIE = "km_google_oauth";

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  if (!academyCanConnectGoogleMeet(workspace.studentPortalFeatures)) {
    return NextResponse.redirect(new URL("/dashboard/live-classes", origin));
  }
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/live-classes?google=error&reason=not_configured", origin),
    );
  }

  const nonce = crypto.randomUUID();
  const state = `${nonce}.${workspace.traderId}`;
  const response = NextResponse.redirect(googleAuthUrl(origin, state));
  response.cookies.set(COOKIE, nonce, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
