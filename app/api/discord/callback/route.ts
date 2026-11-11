import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canManageDiscordGuild,
  discordConfig,
  discordRedirectUri,
  readDiscordState,
} from "@/lib/discord";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function finish(origin: string, returnTo: string, result: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set("discord", result);
  return NextResponse.redirect(url);
}

type DiscordUser = { id?: string; username?: string; global_name?: string | null };
type DiscordGuild = { id?: string; name?: string; owner?: boolean; permissions?: string };

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const query = new URL(request.url).searchParams;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cookieStore = await cookies();
  const cookieState = cookieStore.get("discord_oauth_state")?.value ?? "";
  cookieStore.set("discord_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/api/discord",
    maxAge: 0,
  });
  const fallback = "/dashboard/settings?tab=integration";
  if (!secret) return finish(origin, fallback, "unavailable");

  const stateToken = query.get("state") ?? "";
  const state = stateToken && stateToken === cookieState ? readDiscordState(stateToken, secret) : null;
  const returnTo = state?.returnTo ?? fallback;
  if (!state) return finish(origin, returnTo, "state");
  if (query.get("error")) return finish(origin, returnTo, "denied");

  const code = query.get("code");
  const config = discordConfig();
  const admin = createAdminClient();
  if (!code || !config.configured || !admin) return finish(origin, returnTo, "unavailable");

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: discordRedirectUri(origin),
    }),
  });
  if (!tokenResponse.ok) return finish(origin, returnTo, "token");
  const tokenJson = await tokenResponse.json() as { access_token?: string };
  if (!tokenJson.access_token) return finish(origin, returnTo, "token");

  const meResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!meResponse.ok) return finish(origin, returnTo, "token");
  const me = await meResponse.json() as DiscordUser;
  if (!me.id || !me.username) return finish(origin, returnTo, "token");
  const displayName = me.global_name?.trim() || me.username;

  if (state.role === "student") {
    const { error } = await admin.from("student_discord_links").upsert({
      trader_id: state.traderId,
      student_user_id: state.userId,
      discord_user_id: me.id,
      discord_username: displayName,
      linked_at: new Date().toISOString(),
    }, { onConflict: "trader_id,student_user_id" });
    return finish(origin, returnTo, error ? "save" : "linked");
  }

  const guildId = query.get("guild_id");
  if (!guildId) return finish(origin, returnTo, "guild");
  const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!guildsResponse.ok) return finish(origin, returnTo, "token");
  const guilds = await guildsResponse.json() as DiscordGuild[];
  const guild = guilds.find((item) => item.id === guildId);
  if (!guild?.id || !guild.name || !canManageDiscordGuild(guild)) {
    return finish(origin, returnTo, "permission");
  }

  const { error } = await admin.from("academy_discord_servers").upsert({
    trader_id: state.traderId,
    guild_id: guild.id,
    guild_name: guild.name,
    discord_user_id: me.id,
    discord_username: displayName,
    linked_by: state.userId,
    linked_at: new Date().toISOString(),
  });
  return finish(origin, returnTo, error ? "save" : "linked");
}
