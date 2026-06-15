import { Activity, Building2, CreditCard, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricCard } from "@/components/metric-card";
import { createClient } from "@/lib/supabase/server";
import styles from "./admin.module.css";

export default async function AdminDashboard() {
  const supabase = await createClient();
  let stats = { traders: 0, students: 0, brokers: 0, subscriptions: 0 };

  if (supabase) {
    const [traders, students, brokers, subscriptions] = await Promise.all([
      supabase.from("traders").select("*", { count: "exact", head: true }),
      supabase.from("student_applications").select("*", { count: "exact", head: true }),
      supabase.from("brokers").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("subscriptions").select("*", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    ]);
    stats = {
      traders: traders.count ?? 0,
      students: students.count ?? 0,
      brokers: brokers.count ?? 0,
      subscriptions: subscriptions.count ?? 0,
    };
  }

  return (
    <DashboardShell
      description="Platform health, tenant activity, and operational controls."
      mode="admin"
      title="Platform overview"
      userLabel="Super Admin"
    >
      <section className={styles.metrics}>
        <MetricCard icon={Building2} label="Mentor tenants" note="Across all statuses" value={stats.traders} />
        <MetricCard icon={Users} label="Student applications" note="Platform total" value={stats.students} />
        <MetricCard icon={Activity} label="Active brokers" note="Available integrations" value={stats.brokers} />
        <MetricCard icon={CreditCard} label="Active subscriptions" note="Including trials" value={stats.subscriptions} />
      </section>
      <section className={styles.grid}>
        <article className={`card ${styles.panel}`}>
          <p className="eyebrow">Operations</p>
          <h2>Platform activity</h2>
          <div className={styles.empty}>
            <Activity size={25} />
            <strong>Audit activity will appear here</strong>
            <p>Tenant, broker, content, and subscription changes are recorded by database triggers.</p>
          </div>
        </article>
        <article className={`card ${styles.panel}`}>
          <p className="eyebrow">Broker network</p>
          <h2>Integration health</h2>
          <div className={styles.health}>
            <span />
            <div>
              <strong>Adapter registry ready</strong>
              <p>Add broker configurations from the broker management module.</p>
            </div>
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
