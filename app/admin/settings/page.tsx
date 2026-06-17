import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import styles from "../platform-tables.module.css";

export default async function AdminSettingsPage() {
  const { userLabel } = await requirePlatformAdmin();

  return (
    <DashboardShell
      activePath="/admin/settings"
      description="Platform-level operational settings and governance controls."
      mode="admin"
      title="Platform Settings"
      userLabel={userLabel}
    >
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className="eyebrow">Configuration</p>
            <h2>KaiMentors platform controls</h2>
            <p>Readiness overview for the platform settings surface.</p>
          </div>
        </div>
        <div className={styles.settingsGrid}>
          <article className={styles.settingCard}>
            <strong>Custom site ownership</strong>
            <span>Package assignment is restricted to super admins.</span>
          </article>
          <article className={styles.settingCard}>
            <strong>Tenant isolation</strong>
            <span>RLS policies protect mentor and student records by tenant.</span>
          </article>
          <article className={styles.settingCard}>
            <strong>Domain automation</strong>
            <span>Vercel domain management is configured for production.</span>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
