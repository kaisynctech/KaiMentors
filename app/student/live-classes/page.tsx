import { CalendarClock, ExternalLink, Video } from "lucide-react";
import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./live-classes.module.css";

export const dynamic = "force-dynamic";

export default async function StudentLiveClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${base}/login${suffix}`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/login${suffix}`);

  let appQuery = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)",
    )
    .eq("student_user_id", user.id);
  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);
  const { data: app } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName =
    base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = app.status === "verified";

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={base}
        displayName={displayName}
        isVerified={isVerified}
        logoPath={portal?.logo_path ?? null}
        querySuffix={suffix}
      >
        {children}
      </StudentShell>
    );
  }

  if (!isVerified) {
    return (
      <Shell>
        <div className={styles.page}>
          <div className={styles.pageHeader}>
            <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
            <h1>Live Classes</h1>
          </div>
          <ContentGate
            applicationStatus={app.status}
            returnPath={`${base}${suffix}`}
          />
        </div>
      </Shell>
    );
  }

  const now = new Date().toISOString();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase
      .from("live_classes")
      .select("id,title,description,provider,meeting_id,join_url,starts_at,ends_at")
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .gte("starts_at", now)
      .order("starts_at")
      .limit(20),
    supabase
      .from("live_classes")
      .select("id,title,description,provider,starts_at,ends_at")
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .lt("starts_at", now)
      .order("starts_at", { ascending: false })
      .limit(10),
  ]);

  function formatDay(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit" });
  }
  function formatMonth(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short" });
  }
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  function formatFull(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "long" });
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>Live Classes</h1>
        </div>

        {/* Upcoming */}
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Upcoming</p>
          {upcoming && upcoming.length > 0 ? (
            <div className={styles.list}>
              {upcoming.map((cls) => (
                <div className={styles.card} key={cls.id}>
                  <div className={styles.dateBadge}>
                    <span className={styles.dateDay}>{formatDay(cls.starts_at)}</span>
                    <span className={styles.dateMonth}>{formatMonth(cls.starts_at)}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{cls.title}</p>
                    <p className={styles.cardMeta}>
                      {formatFull(cls.starts_at)} · {formatTime(cls.starts_at)}
                      {cls.ends_at ? ` – ${formatTime(cls.ends_at)}` : ""}
                    </p>
                    {cls.description ? (
                      <p className={styles.cardDesc}>{cls.description}</p>
                    ) : null}
                  </div>
                  {cls.provider === "zoom" && cls.meeting_id ? (
                    <a
                      className={styles.joinBtn}
                      href={`/student/live-classes/${cls.id}`}
                    >
                      <Video size={14} />
                      Join
                    </a>
                  ) : cls.join_url ? (
                    <a
                      className={styles.joinBtn}
                      href={cls.join_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Video size={14} />
                      Join
                      <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <CalendarClock size={32} />
              <p>No upcoming live classes scheduled.</p>
            </div>
          )}
        </section>

        {/* Past classes */}
        {past && past.length > 0 ? (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>Past classes</p>
            <div className={styles.list}>
              {past.map((cls) => (
                <div className={styles.card} key={cls.id}>
                  <div
                    className={styles.dateBadge}
                    style={{ background: "#f4f6f7", color: "#9aa0a5" }}
                  >
                    <span className={styles.dateDay}>{formatDay(cls.starts_at)}</span>
                    <span className={styles.dateMonth}>{formatMonth(cls.starts_at)}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{cls.title}</p>
                    <p className={styles.cardMeta}>
                      {formatFull(cls.starts_at)} · {formatTime(cls.starts_at)}
                      {cls.ends_at ? ` – ${formatTime(cls.ends_at)}` : ""}
                    </p>
                    {cls.description ? (
                      <p className={styles.cardDesc}>{cls.description}</p>
                    ) : null}
                  </div>
                  <span className={styles.pastBadge}>Past</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
