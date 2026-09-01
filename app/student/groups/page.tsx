import { BookOpen, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getStudentAcademyContext, getStudentLoginHref } from "@/lib/student-routing";
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
  if (!supabase) redirect(getStudentLoginHref(academy));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(getStudentLoginHref(academy));
  if (
    !isPortalFeatureEnabled(
      academy.studentPortalFeatures,
      "groups",
      academy.accessModel,
    )
  ) {
    redirect(`${academy.basePath}${academy.querySuffix}`);
  }

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const { application: app, portal, hasModuleAccess } = ctx;
  const academyName = portal.portal_name;
  const displayName = ctx.fullName?.trim() || user.email?.split("@")[0] || "Student";

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={base}
        displayName={displayName}
        hasModuleAccess={hasModuleAccess}
        logoPath={portal.logo_path}
        portalSlug={portal.slug}
        querySuffix={suffix}
        traderId={app.trader_id}
      >
        {children}
      </StudentShell>
    );
  }

  if (!hasModuleAccess) {
    return (
      <Shell>
        <div className={styles.page}>
          <div className={styles.pageHeader}>
            <p className="eyebrow">{portal.portal_name}</p>
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
      "id,group_id,student_groups(id,name,description,color,is_active,system_key)",
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
    // Exclude the auto-created 'all_students' system group and any other
    // system_key-tagged group -- these are internal broadcast/access-control
    // constructs, not groups the student was intentionally placed in.
    .filter((g) => g?.is_active && g?.system_key == null);

  const groupIds = groups.map((g) => g!.id);

  // Member counts and linked courses both need to read rows belonging to
  // OTHER students / to a mentor-only table. RLS deliberately does not allow
  // that for the student's own session client:
  //   - "students read own group membership" on student_group_members only
  //     matches rows whose application.student_user_id = auth.uid(), so a
  //     session-scoped count query would always return 1, never the true
  //     group size.
  //   - content_access_grants has no student-facing SELECT policy at all
  //     (only "tenant members manage content grants", gated on
  //     is_trader_member) -- a session-scoped query there returns zero rows
  //     unconditionally, not just until MB-122 populates grants.
  // The admin client is safe here because both queries are scoped to
  // groupIds already proven (via the RLS-protected membership query above)
  // to belong to this student -- no group_id the student doesn't belong to
  // is ever queryable this way, and only counts/course titles are returned,
  // never other members' identities.
  const admin = createAdminClient();

  const countMap = new Map<string, number>();
  if (groupIds.length > 0 && admin) {
    const { data: counts } = await admin
      .from("student_group_members")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("trader_id", app.trader_id);
    counts?.forEach((row) => {
      countMap.set(row.group_id, (countMap.get(row.group_id) ?? 0) + 1);
    });
  }

  const courseMap = new Map<string, { id: string; title: string }[]>();
  if (groupIds.length > 0 && admin) {
    const { data: grants } = await admin
      .from("content_access_grants")
      .select("group_id, entity_id, courses!inner(id,title)")
      .eq("trader_id", app.trader_id)
      .eq("entity_type", "course")
      .in("group_id", groupIds);
    grants?.forEach((g) => {
      if (!g.group_id) return;
      const course = Array.isArray(g.courses) ? g.courses[0] : g.courses;
      if (!course) return;
      const existing = courseMap.get(g.group_id) ?? [];
      courseMap.set(g.group_id, [...existing, { id: course.id, title: course.title }]);
    });
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>Groups</h1>
        </div>

        {groups.length > 0 ? (
          <div className={styles.grid}>
            {groups.map((group) => {
              const count = countMap.get(group!.id) ?? 0;
              const courses = courseMap.get(group!.id) ?? [];
              return (
                <div className={styles.card} key={group!.id}>
                  <div className={styles.cardTop}>
                    <span
                      className={styles.dot}
                      style={{ background: group!.color ?? "#7ab648" }}
                    />
                    <h2 className={styles.cardTitle}>{group!.name}</h2>
                  </div>
                  <p className={styles.memberCount}>
                    {count} member{count !== 1 ? "s" : ""}
                  </p>
                  {group!.description ? (
                    <p className={styles.cardDesc}>{group!.description}</p>
                  ) : null}
                  {courses.length > 0 ? (
                    <div className={styles.coursesBlock}>
                      <p className={styles.coursesHeading}>
                        <BookOpen size={13} />
                        Courses in this group
                      </p>
                      <ul className={styles.coursesList}>
                        {courses.map((c) => (
                          <li key={c.id}>
                            <a href={`${base}/courses/${c.id}${suffix}`}>{c.title}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className={styles.cardMeta}>
                    Member
                  </p>
                </div>
              );
            })}
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
