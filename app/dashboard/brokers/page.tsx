import { redirect } from "next/navigation";
import { BrokerAccountsManager } from "@/components/broker-accounts-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import type { VerificationMethod } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export default async function BrokerAccountsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data } = await supabase
    .from("trader_broker_accounts")
    .select(
      "id,partner_code,affiliate_link,verification_method,verification_instructions,is_active,broker:brokers(name)",
    )
    .eq("trader_id", membership.trader_id)
    .order("created_at", { ascending: false });

  const accounts = (data ?? []).map((account) => ({
    ...account,
    verification_method:
      account.verification_method as VerificationMethod,
    verification_instructions:
      (account as { verification_instructions?: string | null })
        .verification_instructions ?? null,
    broker: Array.isArray(account.broker)
      ? account.broker[0] ?? null
      : account.broker,
  }));
  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/brokers"
      description="Connect multiple partner accounts and choose how students are verified."
      title="Broker accounts"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <BrokerAccountsManager accounts={accounts} />
    </DashboardShell>
  );
}
