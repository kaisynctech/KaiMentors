import "server-only";

import { NextResponse } from "next/server";
import type { FeatureEntitlementState, SubscriptionSummary } from "@/lib/billing-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getMentorWorkspace } from "@/lib/workspace";

const GRANDFATHER_TRIAL_END = "2026-07-31T21:59:59.000Z";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isGrandfatherTrialEnd(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  return Math.abs(new Date(trialEndsAt).getTime() - new Date(GRANDFATHER_TRIAL_END).getTime()) < 60_000;
}

function evaluateSubscriptionActive(
  environment: string | null | undefined,
  sub: {
    status: string;
    trial_ends_at: string | null;
    current_period_ends_at: string | null;
  } | null,
): boolean {
  if (environment === "acceptance_test") return true;
  if (!sub) return false;

  const now = Date.now();
  if (sub.status === "cancelled" || sub.status === "past_due") return false;

  if (sub.status === "active") {
    if (sub.current_period_ends_at && new Date(sub.current_period_ends_at).getTime() <= now) {
      return false;
    }
    return true;
  }

  if (sub.status === "trialing") {
    if (sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() <= now) {
      return false;
    }
    return true;
  }

  return false;
}

export async function isAcademyActive(traderId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return true;

  const [{ data: trader }, { data: sub }] = await Promise.all([
    admin.from("traders").select("environment").eq("id", traderId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_ends_at")
      .eq("trader_id", traderId)
      .maybeSingle(),
  ]);

  return evaluateSubscriptionActive(trader?.environment, sub);
}

export async function getSubscriptionSummary(
  traderId: string,
): Promise<SubscriptionSummary | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: sub } = await admin
    .from("subscriptions")
    .select(
      "trader_id, plan_key, status, currency, monthly_amount_cents, go_live_at, trial_ends_at, current_period_ends_at, billing_provider",
    )
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!sub) return null;

  const active = await isAcademyActive(traderId);
  const trialEndsAt = sub.trial_ends_at as string | null;
  const periodEndsAt = sub.current_period_ends_at as string | null;
  const countdownTarget =
    sub.status === "active" ? periodEndsAt : trialEndsAt;

  return {
    traderId,
    planKey: sub.plan_key as string,
    status: sub.status as string,
    currency: sub.currency as string,
    monthlyAmountCents: sub.monthly_amount_cents as number,
    goLiveAt: sub.go_live_at as string | null,
    trialEndsAt,
    currentPeriodEndsAt: periodEndsAt,
    billingProvider: sub.billing_provider as string,
    daysLeft: daysUntil(countdownTarget),
    isActive: active,
    isGrandfathered: isGrandfatherTrialEnd(trialEndsAt),
  };
}

export async function hasFeature(
  traderId: string,
  featureKey: string,
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return true;

  const { data: feature } = await admin
    .from("platform_features")
    .select("key")
    .eq("key", featureKey)
    .eq("is_active", true)
    .maybeSingle();

  if (!feature) return true;

  const { data: entitlement } = await admin
    .from("trader_feature_entitlements")
    .select("state")
    .eq("trader_id", traderId)
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (!entitlement) return false;
  return entitlement.state === "trialing" || entitlement.state === "active";
}

export async function getFeatureState(
  traderId: string,
  featureKey: string,
): Promise<FeatureEntitlementState> {
  const admin = createAdminClient();
  if (!admin) return "hidden";

  const { data: feature } = await admin
    .from("platform_features")
    .select("key")
    .eq("key", featureKey)
    .eq("is_active", true)
    .maybeSingle();

  if (!feature) return "hidden";

  const { data: entitlement } = await admin
    .from("trader_feature_entitlements")
    .select("state")
    .eq("trader_id", traderId)
    .eq("feature_key", featureKey)
    .maybeSingle();

  return (entitlement?.state as FeatureEntitlementState | undefined) ?? "preview";
}

export async function isSuperAdminUser(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "super_admin";
}

export async function requireActiveMentorWorkspace() {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const bypass = await isSuperAdminUser();
  if (!bypass) {
    const active = await isAcademyActive(workspace.traderId);
    if (!active) {
      return {
        error: NextResponse.json(
          { error: "Subscription inactive. Renew to continue." },
          { status: 402 },
        ),
      };
    }
  }

  return { workspace };
}
