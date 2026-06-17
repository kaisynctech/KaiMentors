import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import styles from "../platform-tables.module.css";

interface BrokerRow {
  id: string;
  name: string;
  slug: string;
  adapter_key: string;
  is_active: boolean;
  trader_broker_accounts: Array<{ id: string }> | null;
}

export default async function AdminBrokersPage() {
  const { supabase, userLabel } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("brokers")
    .select("id,name,slug,adapter_key,is_active,trader_broker_accounts(id)")
    .order("name");
  const brokers = (data ?? []) as BrokerRow[];

  return (
    <DashboardShell
      activePath="/admin/brokers"
      description="Review broker adapters and tenant connection usage across KaiMentors."
      mode="admin"
      title="Broker Network"
      userLabel={userLabel}
    >
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className="eyebrow">Broker registry</p>
            <h2>Platform broker adapters</h2>
            <p>Central overview of broker records available to mentor tenants.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Broker</th>
                <th>Slug</th>
                <th>Adapter</th>
                <th>Status</th>
                <th>Tenant connections</th>
              </tr>
            </thead>
            <tbody>
              {brokers.length ? brokers.map((broker) => (
                <tr key={broker.id}>
                  <td><strong>{broker.name}</strong></td>
                  <td>{broker.slug}</td>
                  <td>{broker.adapter_key}</td>
                  <td><span className={styles.badge}>{broker.is_active ? "active" : "inactive"}</span></td>
                  <td>{broker.trader_broker_accounts?.length ?? 0}</td>
                </tr>
              )) : (
                <tr><td className={styles.empty} colSpan={5}>No brokers configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
