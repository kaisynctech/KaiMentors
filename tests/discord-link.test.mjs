import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageDiscordGuild,
  discordStateExpiry,
  readDiscordState,
  signDiscordState,
} from "../lib/discord.ts";

test("Discord link state round-trips and rejects a tampered token", () => {
  const secret = "test-secret";
  const state = {
    traderId: "trader-1",
    userId: "user-1",
    role: "mentor",
    returnTo: "/dashboard/settings",
    exp: discordStateExpiry(),
  };
  const token = signDiscordState(state, secret);
  assert.deepEqual(readDiscordState(token, secret)?.userId, "user-1");
  assert.equal(readDiscordState(`${token}x`, secret), null);
  assert.equal(readDiscordState(token, "other-secret"), null);
});

test("only a Discord server owner or manager can link that server", () => {
  assert.equal(canManageDiscordGuild({ owner: true, permissions: "0" }), true);
  assert.equal(canManageDiscordGuild({ owner: false, permissions: "32" }), true);
  assert.equal(canManageDiscordGuild({ owner: false, permissions: "1" }), false);
});
