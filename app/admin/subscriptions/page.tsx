import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import styles from "../platform-tables.module.css";

interface SubscriptionRow {
  id: string;
  plan_key: string;
  status: string;
  currency: string;
  monthly_amount_cents: number;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  trader:
    | { display_name: string; legal_name: string }
    | { display_name: string; legal_name: string }[]
    | null;
}

export default async function AdminSubscriptionsPage() {
  const { supabase, userLabel } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "id,plan_key,status,currency,monthly_amount_cents,trial_ends_at,current_period_ends_at,trader:traders(id,display_name,legal_name)",
    )
    .order("created_at", { ascending: false });
  const subscriptions = ((data ?? []) as SubscriptionRow[]).map((subscription) => ({
    ...subscription,
    trader: Array.isArray(subscription.trader)
      ? subscription.trader[0] ?? null
      : subscription.trader,
  })) as Array<
    Omit<SubscriptionRow, "trader"> & {
      trader: { id: string; display_name: string; legal_name: string } | null;
    }
  >;

  return (
    <DashboardShell
      activePath="/admin/subscriptions"
      description="Monitor plan status and billing readiness across mentor tenants."
      mode="admin"
      title="Subscriptions"
      userLabel={userLabel}
    >
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className="eyebrow">Commercial operations</p>
            <h2>Tenant subscriptions</h2>
            <p>Subscription records are tracked per mentor workspace.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Price</th>
                <th>Trial ends</th>
                <th>Period end</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length ? subscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td>
                    <strong>{subscription.trader?.display_name ?? "Unknown tenant"}</strong>
                    <span>{subscription.trader?.legal_name ?? ""}</span>
                  </td>
                  <td>{subscription.plan_key}</td>
                  <td><span className={styles.badge}>{subscription.status}</span></td>
                  <td>
                    R{(subscription.monthly_amount_cents / 100).toFixed(0)}/{subscription.currency === "ZAR" ? "mo" : subscription.currency}
                  </td>
                  <td>{subscription.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString() : "Not set"}</td>
                  <td>{subscription.current_period_ends_at ? new Date(subscription.current_period_ends_at).toLocaleDateString() : "Not set"}</td>
                  <td>
                    {subscription.trader?.id ? (
                      <Link href={`/admin/traders/${subscription.trader.id}/billing`}>Manage</Link>
                    ) : null}
                  </td>
                </tr>
              )) : (
                <tr><td className={styles.empty} colSpan={7}>No subscriptions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
