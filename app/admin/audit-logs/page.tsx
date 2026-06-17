import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import styles from "../platform-tables.module.css";

interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  trader: { display_name: string } | { display_name: string }[] | null;
}

export default async function AdminAuditLogsPage() {
  const { supabase, userLabel } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("audit_logs")
    .select("id,action,entity_type,entity_id,created_at,trader:traders(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const logs = ((data ?? []) as AuditRow[]).map((log) => ({
    ...log,
    trader: Array.isArray(log.trader) ? log.trader[0] ?? null : log.trader,
  })) as Array<Omit<AuditRow, "trader"> & { trader: { display_name: string } | null }>;

  return (
    <DashboardShell
      activePath="/admin/audit-logs"
      description="Review recent platform and tenant mutations recorded by database triggers."
      mode="admin"
      title="Audit Logs"
      userLabel={userLabel}
    >
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className="eyebrow">Governance</p>
            <h2>Recent audit activity</h2>
            <p>Latest 200 recorded changes across the platform.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tenant</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.length ? logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.trader?.display_name ?? "Platform"}</td>
                  <td><span className={styles.badge}>{log.action}</span></td>
                  <td>{log.entity_type}</td>
                  <td><span>{log.entity_id ?? "none"}</span></td>
                </tr>
              )) : (
                <tr><td className={styles.empty} colSpan={5}>No audit logs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
