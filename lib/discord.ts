import { createHmac, timingSafeEqual } from "node:crypto";

export const SHARESWORLDWIDE_SLUG = "bandi-shares";

const STATE_TTL_MS = 10 * 60 * 1000;

export type DiscordLinkRole = "mentor" | "student";

export type DiscordOAuthState = {
  traderId: string;
  userId: string;
  role: DiscordLinkRole;
  returnTo: string;
  exp: number;
};

export function discordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() ?? "";
  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
  };
}

export function discordRedirectUri(origin: string) {
  return `${origin}/api/discord/callback`;
}

export function signDiscordState(state: DiscordOAuthState, secret: string) {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readDiscordState(token: string, secret: string): DiscordOAuthState | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DiscordOAuthState;
    if (!parsed.traderId || !parsed.userId || !parsed.returnTo || !parsed.exp) return null;
    if (parsed.role !== "mentor" && parsed.role !== "student") return null;
    if (parsed.exp < Date.now()) return null;
    if (!parsed.returnTo.startsWith("/") || parsed.returnTo.startsWith("//")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function discordStateExpiry(now = Date.now()) {
  return now + STATE_TTL_MS;
}

export function discordAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  role: DiscordLinkRole;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  if (input.role === "mentor") {
    url.searchParams.set("scope", "bot identify guilds");
    url.searchParams.set("permissions", "1");
  } else {
    url.searchParams.set("scope", "identify");
  }
  return url.toString();
}

export function canManageDiscordGuild(guild: { owner?: boolean; permissions?: string }) {
  if (guild.owner) return true;
  try {
    const permissions = BigInt(guild.permissions ?? "0");
    const administrator = 8n;
    const manageGuild = 32n;
    return (permissions & administrator) === administrator || (permissions & manageGuild) === manageGuild;
  } catch {
    return false;
  }
}

export function discordNotice(code: string | undefined) {
  switch (code) {
    case "linked":
      return "Discord is connected.";
    case "unlinked":
      return "Discord is disconnected.";
    case "not_configured":
      return "The Discord application keys are not on the server yet.";
    case "denied":
      return "Discord linking was cancelled.";
    case "guild":
      return "Choose the Discord server and allow the bot to join it.";
    case "permission":
      return "That Discord account cannot manage the selected server.";
    case "not_allowed":
      return "This Discord connection is only for Sharesworldwide.";
    case "state":
      return "The Discord connection expired. Try again.";
    case "token":
      return "Discord did not confirm the account. Try again.";
    case "save":
      return "Discord confirmed the account, and the academy could not save it.";
    case "unavailable":
      return "Discord linking is unavailable right now.";
    default:
      return null;
  }
}
