import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { BookingSessionTypeManager } from "@/components/booking-session-type-manager";
import { createClient } from "@/lib/supabase/server";

export default async function BookingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name,timezone)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: sessionTypes } = await supabase
    .from("booking_session_types")
    .select(
      "id,name,description,duration_minutes,max_participants,buffer_minutes,requires_approval,advance_booking_days,min_notice_hours,cancellation_hours,zoom_meeting_id,is_active,sort_order",
    )
    .eq("trader_id", membership.trader_id)
    .order("sort_order")
    .order("created_at");

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/bookings"
      description="Manage session types, availability, and student bookings."
      title="Bookings"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <BookingSessionTypeManager
        mentorTimezone={trader?.timezone ?? "UTC"}
        sessionTypes={sessionTypes ?? []}
      />
    </DashboardShell>
  );
}
