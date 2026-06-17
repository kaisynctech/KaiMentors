import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";
import styles from "../platform-tables.module.css";

interface TraderRow {
  id: string;
  display_name: string;
  legal_name: string;
  status: string;
  created_at: string;
  portal: Array<{
    slug: string;
    portal_name: string;
    website_delivery_mode: string;
  }> | null;
  custom_site_assignments: Array<{
    status: string;
    package:
      | { name: string; version: number }
      | { name: string; version: number }[]
      | null;
  }> | null;
}

export default async function AdminTradersPage() {
  const { supabase, userLabel } = await requirePlatformAdmin();
  const [tradersResult, studentsResult] = await Promise.all([
    supabase
      .from("traders")
      .select(
        "id,display_name,legal_name,status,created_at,portal:portals(slug,portal_name,website_delivery_mode),custom_site_assignments(status,package:custom_site_packages(name,version))",
      )
      .order("created_at", { ascending: false }),
    supabase.from("student_applications").select("trader_id"),
  ]);

  const studentCounts = new Map<string, number>();
  (studentsResult.data ?? []).forEach((row) => {
    const traderId = (row as { trader_id: string }).trader_id;
    studentCounts.set(traderId, (studentCounts.get(traderId) ?? 0) + 1);
  });

  const traders = ((tradersResult.data ?? []) as TraderRow[]).map((trader) => ({
    ...trader,
    custom_site_assignments: (trader.custom_site_assignments ?? []).map(
      (assignment) => ({
        ...assignment,
        package: Array.isArray(assignment.package)
          ? assignment.package[0] ?? null
          : assignment.package,
      }),
    ),
  })) as Array<
    Omit<TraderRow, "custom_site_assignments"> & {
      custom_site_assignments: Array<{
        status: string;
        package: { name: string; version: number } | null;
      }>;
    }
  >;

  return (
    <DashboardShell
      activePath="/admin/traders"
      description="View every mentor tenant, portal, student count, and assigned website package."
      mode="admin"
      title="Mentors"
      userLabel={userLabel}
    >
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className="eyebrow">Tenant registry</p>
            <h2>Mentor workspaces</h2>
            <p>Operational view of every academy running on KaiMentors.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Mentor</th>
                <th>Portal</th>
                <th>Status</th>
                <th>Students</th>
                <th>Website mode</th>
                <th>Custom package</th>
              </tr>
            </thead>
            <tbody>
              {traders.length ? (
                traders.map((trader) => {
                  const portal = trader.portal?.[0] ?? null;
                  const assignment = trader.custom_site_assignments?.[0] ?? null;
                  return (
                    <tr key={trader.id}>
                      <td>
                        <strong>{trader.display_name}</strong>
                        <span>{trader.legal_name}</span>
                      </td>
                      <td>
                        <strong>{portal?.portal_name ?? "No portal"}</strong>
                        <span>{portal ? `/portal/${portal.slug}` : "Not provisioned"}</span>
                      </td>
                      <td><span className={styles.badge}>{trader.status}</span></td>
                      <td>{studentCounts.get(trader.id) ?? 0}</td>
                      <td>{portal?.website_delivery_mode?.replace(/_/g, " ") ?? "none"}</td>
                      <td>
                        {assignment?.package
                          ? `${assignment.package.name} v${assignment.package.version}`
                          : "No package assigned"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td className={styles.empty} colSpan={6}>No mentor tenants yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
