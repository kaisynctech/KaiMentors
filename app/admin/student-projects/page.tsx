import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformAdmin } from "@/lib/admin-access";

export default async function StudentProjectsPage() {
  const { userLabel } = await requirePlatformAdmin();

  return (
    <DashboardShell
      activePath="/admin/student-projects"
      description="Student project showcases are owned by each academy, not the platform console."
      mode="admin"
      title="Student Projects"
      userLabel={userLabel}
    >
      <section className="card" style={{ padding: "1.5rem", maxWidth: 640 }}>
        <p className="eyebrow">Academy workspace</p>
        <h2 style={{ marginTop: 0 }}>Manage projects from the mentor dashboard</h2>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.55 }}>
          KaiSync Institution projects belong to that academy. Open the KSI
          mentor workspace and use <strong>Projects</strong> in the sidebar.
          The same module is on for KaiTrades. Other academies can turn it on
          under Settings → Features.
        </p>
        <p>
          <Link href="/dashboard/projects">Go to mentor Projects →</Link>
        </p>
      </section>
    </DashboardShell>
  );
}
