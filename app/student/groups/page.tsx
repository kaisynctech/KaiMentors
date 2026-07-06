import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./groups.module.css";

export const dynamic = "force-dynamic";

export default async function StudentGroupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix, joinAcademyPath } = academy;

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

  if (!app) redirect(joinAcademyPath);

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = portal?.portal_name ?? "Academy";
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
        portalSlug={portal?.slug}
        querySuffix={suffix}
        traderId={app?.trader_id}
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
            <h1>Groups</h1>
          </div>
          <ContentGate
            applicationStatus={app.status}
            returnPath={`${base}${suffix}`}
          />
        </div>
      </Shell>
    );
  }

  // Fetch group memberships for this student's application
  const { data: memberships } = await supabase
    .from("student_group_members")
    .select(
      "id,group_id,student_groups(id,name,description,color,is_active)",
    )
    .eq("trader_id", app.trader_id)
    .eq("application_id", app.id);

  const groups = (memberships ?? [])
    .map((m) => {
      const g = Array.isArray(m.student_groups)
        ? m.student_groups[0]
        : m.student_groups;
      return g;
    })
    .filter(Boolean)
    .filter((g) => g?.is_active);

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>Groups</h1>
        </div>

        {groups.length > 0 ? (
          <div className={styles.grid}>
            {groups.map((group) => (
              <div className={styles.card} key={group!.id}>
                <div className={styles.cardTop}>
                  <span
                    className={styles.dot}
                    style={{ background: group!.color ?? "#7ab648" }}
                  />
                  <h2 className={styles.cardTitle}>{group!.name}</h2>
                </div>
                {group!.description ? (
                  <p className={styles.cardDesc}>{group!.description}</p>
                ) : null}
                <p className={styles.cardMeta}>
                  Member
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Users size={32} />
            <p>No groups found. Your mentor will assign you to a group once your access is confirmed.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
