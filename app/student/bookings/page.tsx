import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentShell } from "@/components/student-shell";
import { StudentBookingFlow } from "@/components/student-booking-flow";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentBookingsPage({
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
        <ContentGate applicationStatus={app.status} returnPath={`${base}${suffix}`} />
      </Shell>
    );
  }

  const now = new Date().toISOString();
  const [{ data: sessionTypes }, { data: upcomingBookings }, { data: mentorMembers }] =
    await Promise.all([
      supabase
        .from("booking_session_types")
        .select(
          "id,name,description,duration_minutes,max_participants,requires_approval",
        )
        .eq("trader_id", app.trader_id)
        .eq("is_active", true)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("bookings")
        .select(
          "id,starts_at,ends_at,status,session_type:booking_session_types(name)",
        )
        .eq("student_user_id", user.id)
        .eq("trader_id", app.trader_id)
        .in("status", ["pending", "confirmed"])
        .gte("ends_at", now)
        .order("starts_at")
        .limit(10),
      supabase
        .from("trader_members")
        .select("user_id, role")
        .eq("trader_id", app.trader_id)
        .order("created_at"),
    ]);

  const mentorUserIds = (mentorMembers ?? []).map((m) => m.user_id);
  const { data: mentorProfiles } = mentorUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", mentorUserIds)
    : { data: [] };

  const mentors = (mentorMembers ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role as "owner" | "mentor",
    name: mentorProfiles?.find((p) => p.id === m.user_id)?.full_name ?? "Mentor",
  }));

  return (
    <Shell>
      <StudentBookingFlow
        academyName={academyName}
        mentors={mentors}
        sessionTypes={sessionTypes ?? []}
        traderId={app.trader_id}
        upcomingBookings={upcomingBookings ?? []}
      />
    </Shell>
  );
}
