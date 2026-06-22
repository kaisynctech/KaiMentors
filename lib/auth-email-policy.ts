import type { SupabaseClient } from "@supabase/supabase-js";

type DeliveryMode = "canary_only" | "production_enabled";

interface DeliveryPolicy {
  mode: DeliveryMode;
  canary_environment: "acceptance_test";
}

export async function getAuthEmailDeliveryPolicy(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "auth_email_delivery_policy")
    .maybeSingle();
  if (error || !data) return { mode: "canary_only", canary_environment: "acceptance_test" } satisfies DeliveryPolicy;
  const value = data.value as Partial<DeliveryPolicy>;
  return {
    mode: value.mode === "production_enabled" ? "production_enabled" : "canary_only",
    canary_environment: "acceptance_test",
  } satisfies DeliveryPolicy;
}

export async function canSendAuthEmail(admin: SupabaseClient, userId: string | null) {
  const policy = await getAuthEmailDeliveryPolicy(admin);
  if (policy.mode === "production_enabled") return true;
  if (!userId) return false;

  const [{ data: membership }, { data: application }, { data: ownership }] = await Promise.all([
    admin
      .from("trader_members")
      .select("trader:traders!inner(environment)")
      .eq("user_id", userId)
      .eq("trader.environment", policy.canary_environment)
      .limit(1)
      .maybeSingle(),
    admin
      .from("student_applications")
      .select("trader:traders!inner(environment)")
      .eq("student_user_id", userId)
      .eq("trader.environment", policy.canary_environment)
      .limit(1)
      .maybeSingle(),
    admin
      .from("traders")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("environment", policy.canary_environment)
      .limit(1)
      .maybeSingle(),
  ]);
  return Boolean(membership || application || ownership);
}
