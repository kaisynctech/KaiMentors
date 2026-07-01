import Link from "next/link";
import { BookOpen, CheckCircle2, Clock3, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricCard } from "@/components/metric-card";
import { getMentorWorkspace } from "@/lib/workspace";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function TraderDashboard() {
  const workspace = await getMentorWorkspace();
  const supabase = workspace?.supabase ?? null;
  const traderId: string | null = workspace?.traderId ?? null;
  const displayName = workspace?.displayName ?? "Mentor workspace";
  let stats = { students: 0, verified: 0, pending: 0, courses: 0 };
  let recent: Array<{
    id: string;
    status: string;
    submitted_at: string;
    profile: { full_name: string; email: string | null } | null;
  }> = [];

  if (supabase && traderId) {
    const [students, verified, pending, courses, applications] = await Promise.all([
      supabase.from("student_applications").select("*", { count: "exact", head: true }).eq("trader_id", traderId),
      supabase.from("student_applications").select("*", { count: "exact", head: true }).eq("trader_id", traderId).eq("status", "verified"),
      supabase.from("student_applications").select("*", { count: "exact", head: true }).eq("trader_id", traderId).in("status", ["pending", "processing", "manual_review", "needs_more_information"]),
      supabase.from("courses").select("*", { count: "exact", head: true }).eq("trader_id", traderId),
      supabase.from("student_applications").select("id,status,submitted_at,profile:profiles!student_user_id(full_name,email)").eq("trader_id", traderId).order("submitted_at", { ascending: false }).limit(5),
    ]);

    stats = {
      students: students.count ?? 0,
      verified: verified.count ?? 0,
      pending: pending.count ?? 0,
      courses: courses.count ?? 0,
    };
    recent = (applications.data ?? []).map((application) => ({
      ...application,
      profile: Array.isArray(application.profile)
        ? application.profile[0] ?? null
        : application.profile,
    })) as typeof recent;
  }

  return (
    <DashboardShell
      description="Monitor student access and keep your academy moving."
      title="Overview"
      userLabel={displayName}
    >
      <section className={styles.metrics}>
        <MetricCard icon={Users} label="Total students" note="All applications" value={stats.students} />
        <MetricCard icon={CheckCircle2} label="Verified" note="Content access enabled" value={stats.verified} />
        <MetricCard icon={Clock3} label="Needs attention" note="Pending or manual review" value={stats.pending} />
        <MetricCard icon={BookOpen} label="Courses" note="Draft and published" value={stats.courses} />
      </section>

      <section className={styles.contentGrid}>
        <article className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Recent applications</h2>
              <p>Latest students requesting portal access.</p>
            </div>
            <Link href="/dashboard/students">View all</Link>
          </div>
          {recent.length ? (
            <div className={styles.list}>
              {recent.map((application) => (
                <div className={styles.row} key={application.id}>
                  <div className={styles.avatar}>
                    {(application.profile?.full_name || "S").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{application.profile?.full_name || "Student"}</strong>
                    <span>{application.profile?.email}</span>
                  </div>
                  <span className="status">{application.status.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <Users size={25} />
              <strong>No student applications yet</strong>
              <p>Applications will appear here when students register through your portal.</p>
            </div>
          )}
        </article>

        <article className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Launch checklist</h2>
              <p>Complete the essentials before sharing your portal.</p>
            </div>
          </div>
          <div className={styles.checklist}>
            <Link href="/dashboard/branding"><span>1</span><div><strong>Customize portal branding</strong><p>Add your identity and call to action.</p></div></Link>
            <Link href="/dashboard/brokers"><span>2</span><div><strong>Connect a broker</strong><p>Configure a partner account securely.</p></div></Link>
            <Link href="/dashboard/courses"><span>3</span><div><strong>Publish your first course</strong><p>Give verified students something valuable.</p></div></Link>
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
