import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { BookingSessionTypeManager } from "@/components/booking-session-type-manager";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function BookingsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName, role, timezone, user, portal } = workspace;

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: sessionTypes },
    { data: windows },
    { data: overrides },
    { data: bookings },
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
      .from("bookings")
      .select(
        "id,student_user_id,session_type_id,starts_at,ends_at,status,student_notes,mentor_notes,cancellation_reason,cancelled_by,live_class_id,mentor_user_id,application:student_applications!application_id(profile:profiles!student_user_id(full_name,email)),session_type:booking_session_types!session_type_id(name,duration_minutes)",
      )
      .eq("trader_id", traderId)
      .order("starts_at", { ascending: false })
      .limit(100),
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

  return (
    <DashboardShell
      activePath="/dashboard/bookings"
      description="Manage session types, availability, and student bookings."
      title="Bookings"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
    >
      <BookingSessionTypeManager
        bookings={bookings ?? []}
        callerRole={role}
        callerUserId={user.id}
        mentorTimezone={timezone}
        mentors={mentors}
        overrides={overrides ?? []}
        sessionTypes={sessionTypes ?? []}
        windows={windows ?? []}
      />
    </DashboardShell>
  );
}
