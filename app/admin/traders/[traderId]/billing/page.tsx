import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBillingControls } from "@/components/admin-billing-controls";
import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "../../../platform-tables.module.css";

const GRANDFATHER_TRIAL_END = "2026-07-31T21:59:59.000Z";

function isGrandfatherTrialEnd(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  return Math.abs(new Date(trialEndsAt).getTime() - new Date(GRANDFATHER_TRIAL_END).getTime()) < 60_000;
}

export default async function AdminTraderBillingPage({
  params,
}: {
  params: Promise<{ traderId: string }>;
}) {
  const { traderId } = await params;
  const { userLabel } = await requirePlatformAdmin();
  const admin = createAdminClient();
  if (!admin) notFound();

  const [{ data: trader }, { data: subscription }] = await Promise.all([
    admin
      .from("traders")
      .select("id, display_name, legal_name, environment")
      .eq("id", traderId)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "status, trial_ends_at, go_live_at, current_period_ends_at, plan_key, currency, monthly_amount_cents",
      )
      .eq("trader_id", traderId)
      .maybeSingle(),
  ]);

  if (!trader || !subscription) notFound();

  const trialEndsAt = subscription.trial_ends_at as string | null;

  return (
    <DashboardShell
      activePath="/admin/traders"
      description="Manage subscription status, trials, and billing overrides."
      mode="admin"
      title="Mentor billing"
      userLabel={userLabel}
    >
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <Link href="/admin/traders" style={{ fontSize: "0.82rem" }}>
              ← Back to mentors
            </Link>
          </div>
        </div>
        <AdminBillingControls
          initial={{
            status: subscription.status as string,
            trialEndsAt,
            goLiveAt: subscription.go_live_at as string | null,
            currentPeriodEndsAt: subscription.current_period_ends_at as string | null,
            isGrandfathered: isGrandfatherTrialEnd(trialEndsAt),
          }}
          traderId={trader.id}
          traderName={trader.display_name as string}
        />
      </section>
    </DashboardShell>
  );
}
