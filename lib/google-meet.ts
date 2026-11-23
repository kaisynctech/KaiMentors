import "server-only";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/integrations/google/callback`;
}

export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: `${CALENDAR_SCOPE} ${EMAIL_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !json?.access_token) {
    return { error: json?.error || "token_failed" };
  }
  return json;
}

export async function exchangeGoogleCode(origin: string, code: string) {
  return tokenRequest(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  );
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const token = await tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  );
  return token.access_token ?? null;
}

export async function googleAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as { email?: string } | null;
  return json?.email?.trim() || null;
}

export async function createGoogleMeetLink(input: {
  refreshToken: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
}): Promise<{ joinUrl: string } | { error: string }> {
  const accessToken = await refreshAccessToken(input.refreshToken);
  if (!accessToken) {
    return { error: "The connected Google account needs to be connected again." };
  }

  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) {
    return { error: "Start time is not valid." };
  }
  const end = input.endsAt
    ? new Date(input.endsAt)
    : new Date(start.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return { error: "End time must be after the start time." };
  }

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? undefined,
        start: { dateTime: start.toISOString(), timeZone: input.timeZone || "UTC" },
        end: { dateTime: end.toISOString(), timeZone: input.timeZone || "UTC" },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
  );

  const json = (await response.json().catch(() => null)) as {
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    error?: { message?: string; status?: string };
  } | null;

  const joinUrl =
    json?.hangoutLink ||
    json?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;

  if (!response.ok || !joinUrl) {
    if (json?.error?.status === "PERMISSION_DENIED") {
      return {
        error: "Google Calendar refused the meeting. Enable the Calendar API for this Google app.",
      };
    }
    return { error: "Google did not return a Meet link. You can still paste one." };
  }

  if (!joinUrl.startsWith("https://meet.google.com/")) {
    return { error: "Google returned a link that is not a Meet URL." };
  }

  return { joinUrl };
}
