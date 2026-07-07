import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { StudentSessionsList } from "@/components/student-sessions-list";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { getStudentAcademyContext } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentSessionsPage({
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

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const { application: app, portal, hasModuleAccess } = ctx;
  const academyName = portal.portal_name;
  const displayName = user.email?.split("@")[0] ?? "Student";

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
        <ContentGate applicationStatus={app.status} returnPath={`${base}${suffix}`} />
      </Shell>
    );
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id,trader_id,session_type_id,starts_at,ends_at,status,student_notes,mentor_notes,cancellation_reason,live_class_id,session_type:booking_session_types!session_type_id(name,duration_minutes,cancellation_hours)",
    )
    .eq("student_user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(50);

  return (
    <Shell>
      <StudentSessionsList
        academyName={academyName}
        basePath={base}
        bookings={bookings ?? []}
        querySuffix={suffix}
      />
    </Shell>
  );
}
