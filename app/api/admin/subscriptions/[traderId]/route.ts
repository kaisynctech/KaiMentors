import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_paid") }),
  z.object({
    action: z.literal("extend_trial"),
    days: z.number().int().min(1).max(365).default(30),
  }),
  z.object({
    action: z.literal("set_go_live"),
    goLiveAt: z.string().datetime().optional(),
  }),
  z.object({ action: z.literal("suspend") }),
]);

function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function subscriptionPayload(row: Record<string, unknown>) {
  return {
    status: row.status as string,
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
    goLiveAt: (row.go_live_at as string | null) ?? null,
    currentPeriodEndsAt: (row.current_period_ends_at as string | null) ?? null,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ traderId: string }> },
) {
  const actor = await requirePlatformAdminApi();
  if (!actor) {
    return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  }

  const { traderId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid billing action." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: existing } = await admin
    .from("subscriptions")
    .select("*")
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const now = new Date();
  let patch: Record<string, unknown> = {};
  let message = "Subscription updated.";

  switch (parsed.data.action) {
    case "mark_paid":
      patch = {
        status: "active",
        current_period_ends_at: addDays(now, 30),
      };
      message = "Marked paid. Billing period extended by 30 days.";
      break;
    case "extend_trial": {
      const base = existing.trial_ends_at
        ? new Date(existing.trial_ends_at as string)
        : now;
      const extended =
        base.getTime() > now.getTime() ? base : now;
      patch = {
        status: "trialing",
        trial_ends_at: addDays(extended, parsed.data.days),
      };
      message = `Trial extended by ${parsed.data.days} days.`;
      break;
    }
    case "set_go_live": {
      const goLive = parsed.data.goLiveAt ? new Date(parsed.data.goLiveAt) : now;
      patch = {
        go_live_at: goLive.toISOString(),
        status: "trialing",
        trial_ends_at: addDays(goLive, 30),
      };
      message = "Go-live set. 30-day trial started.";
      break;
    }
    case "suspend":
      patch = { status: "past_due" };
      message = "Workspace suspended.";
      break;
  }

  const { data: updated, error } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("trader_id", traderId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Subscription could not be updated." }, { status: 400 });
  }

  await admin.from("audit_logs").insert({
    trader_id: traderId,
    actor_user_id: actor.user.id,
    actor_role: "super_admin",
    action: `subscription_${parsed.data.action}`,
    entity_type: "subscriptions",
    entity_id: updated.id as string,
    old_data: existing,
    new_data: updated,
  });

  return NextResponse.json({
    message,
    subscription: subscriptionPayload(updated as Record<string, unknown>),
  });
}
