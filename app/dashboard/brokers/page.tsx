import { redirect } from "next/navigation";
import { BrokerAccountsManager } from "@/components/broker-accounts-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import type { VerificationMethod } from "@/lib/database.types";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function BrokerAccountsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const { data } = await supabase
    .from("trader_broker_accounts")
    .select(
      "id,partner_code,affiliate_link,verification_method,verification_instructions,is_active,broker:brokers(name)",
    )
    .eq("trader_id", traderId)
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
  return (
    <DashboardShell
      activePath="/dashboard/brokers"
      description="Connect multiple partner accounts and choose how students are verified."
      title="Broker accounts"
      userLabel={displayName}
    >
      <BrokerAccountsManager accounts={accounts} />
    </DashboardShell>
  );
}
