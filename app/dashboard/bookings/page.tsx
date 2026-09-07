import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { BookingSessionTypeManager } from "@/components/booking-session-type-manager";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";

const BOOKING_PAGE_SIZE = 50;
const BOOKING_SELECT =
  "id,student_user_id,session_type_id,starts_at,ends_at,status,student_notes,mentor_notes,cancellation_reason,cancelled_by,live_class_id,mentor_user_id,application:student_applications!application_id(profile:profiles!student_user_id(full_name,email)),session_type:booking_session_types!session_type_id(name,duration_minutes)";

type BookingTab = "all" | "pending" | "upcoming" | "past" | "cancelled";
const validTabs = new Set<BookingTab>([
  "all",
  "pending",
  "upcoming",
  "past",
  "cancelled",
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "bookings",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }
  const { supabase, traderId, displayName, role, timezone, user, portal } =
    workspace;

  const query = await searchParams;
  const requestedTab = firstValue(query.tab);
  const tab: BookingTab =
    requestedTab && validTabs.has(requestedTab as BookingTab)
      ? (requestedTab as BookingTab)
      : "all";
  const requestedPage = Number(firstValue(query.page));
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedPanel = firstValue(query.panel);
  const mentorParam = firstValue(query.mentor);
  const studentParam = firstValue(query.student);
  const focusStudentId =
    studentParam && UUID_RE.test(studentParam) ? studentParam : "";
  const initialPanel: "session-types" | "availability" | "bookings" =
    requestedPanel === "availability" ||
    requestedPanel === "session-types" ||
    requestedPanel === "bookings"
      ? requestedPanel
      : requestedTab || firstValue(query.page) || mentorParam || focusStudentId
        ? "bookings"
        : "session-types";
  const offset = (page - 1) * BOOKING_PAGE_SIZE;
  const now = new Date().toISOString();
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const today = now.slice(0, 10);

  const [
    { data: sessionTypes },
    { data: windows },
    { data: overrides },
    { data: mentorMembers },
  ] = await Promise.all([
    supabase
      .from("booking_session_types")
      .select(
        "id,name,description,duration_minutes,max_participants,buffer_minutes,requires_approval,advance_booking_days,min_notice_hours,cancellation_hours,zoom_meeting_id,is_active,sort_order",
      )
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("mentor_availability")
      .select("id,day_of_week,start_time,end_time,is_active")
      .eq("trader_id", traderId)
      .eq("mentor_user_id", user.id)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("availability_overrides")
      .select("id,override_date,start_time,end_time,is_blocked,reason")
      .eq("trader_id", traderId)
      .eq("mentor_user_id", user.id)
      .gte("override_date", today)
      .order("override_date")
      .limit(60),
    supabase
      .from("trader_members")
      .select("user_id, role")
      .eq("trader_id", traderId)
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

  const mentorScope =
    role === "owner" && mentorParam === "all"
      ? "all"
      : role === "owner" && mentorParam && UUID_RE.test(mentorParam)
        ? mentorParam
        : user.id;

  let bookingsQuery = supabase
    .from("bookings")
    .select(BOOKING_SELECT, { count: "exact" })
    .eq("trader_id", traderId);

  let pendingQuery = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("trader_id", traderId)
    .eq("status", "pending");

  let upcomingSoonQuery = supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("trader_id", traderId)
    .eq("status", "confirmed")
    .gt("starts_at", now)
    .lte("starts_at", next24h)
    .order("starts_at", { ascending: true })
    .limit(1);

  if (mentorScope !== "all") {
    bookingsQuery = bookingsQuery.eq("mentor_user_id", mentorScope);
    pendingQuery = pendingQuery.eq("mentor_user_id", mentorScope);
    upcomingSoonQuery = upcomingSoonQuery.eq("mentor_user_id", mentorScope);
  }

  if (focusStudentId) {
    bookingsQuery = bookingsQuery.eq("student_user_id", focusStudentId);
    pendingQuery = pendingQuery.eq("student_user_id", focusStudentId);
    upcomingSoonQuery = upcomingSoonQuery.eq("student_user_id", focusStudentId);
  }

  if (tab === "pending") {
    bookingsQuery = bookingsQuery.eq("status", "pending");
  } else if (tab === "upcoming") {
    bookingsQuery = bookingsQuery
      .eq("status", "confirmed")
      .gt("starts_at", now);
  } else if (tab === "past") {
    bookingsQuery = bookingsQuery.lte("starts_at", now);
  } else if (tab === "cancelled") {
    bookingsQuery = bookingsQuery.eq("status", "cancelled");
  }

  const [
    { data: bookings, count: totalCount },
    { count: pendingCount },
    { data: upcomingSoonRows },
    { data: focusStudentRow },
  ] = await Promise.all([
    bookingsQuery
      .order("starts_at", { ascending: false })
      .range(offset, offset + BOOKING_PAGE_SIZE - 1),
    pendingQuery,
    upcomingSoonQuery,
    focusStudentId
      ? supabase
          .from("student_applications")
          .select("full_name, profile:profiles!student_user_id(full_name)")
          .eq("trader_id", traderId)
          .eq("student_user_id", focusStudentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const focusProfile = Array.isArray(focusStudentRow?.profile)
    ? focusStudentRow?.profile[0] ?? null
    : focusStudentRow?.profile ?? null;
  const focusStudentName = focusStudentId
    ? focusStudentRow?.full_name?.trim() ||
      focusProfile?.full_name?.trim() ||
      "Student"
    : null;

  return (
    <DashboardShell
      activePath="/dashboard/bookings"
      description="Manage session types, availability, and student bookings."
      title="Bookings"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <BookingSessionTypeManager
        bookings={bookings ?? []}
        callerRole={role}
        callerUserId={user.id}
        currentMentor={mentorScope}
        currentPage={page}
        currentTab={tab}
        focusStudentId={focusStudentId || null}
        focusStudentName={focusStudentName}
        initialPanel={initialPanel}
        mentorTimezone={timezone}
        mentors={mentors}
        overrides={overrides ?? []}
        pageSize={BOOKING_PAGE_SIZE}
        pendingCount={pendingCount ?? 0}
        totalCount={totalCount ?? 0}
        upcomingSoon={upcomingSoonRows?.[0] ?? null}
        sessionTypes={sessionTypes ?? []}
        windows={windows ?? []}
      />
    </DashboardShell>
  );
}
