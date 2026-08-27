import { NextResponse } from "next/server";
import { cancelSubscription } from "@/lib/payfast";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service not available." }, { status: 503 });
  }

  const { data: subscription } = await admin
    .from("student_subscriptions")
    .select("id,payfast_token,status,current_period_end")
    .eq("student_user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 404 },
    );
  }
  if (!subscription.payfast_token) {
    return NextResponse.json(
      { error: "This subscription has no PayFast token on record." },
      { status: 400 },
    );
  }

  const result = await cancelSubscription(subscription.payfast_token);
  if (!result.ok) {
    return NextResponse.json(
      { error: "PayFast could not confirm the cancellation. Please try again." },
      { status: 502 },
    );
  }

  // Deliberately does NOT touch current_period_end — access continues until the current
  // billing period ends (has_student_module_access() keys on current_period_end for a
  // 'cancelled' row). This differs from the PayFast-initiated CANCELLED ITN path, which
  // ends the grace period immediately — see app/api/webhooks/payfast/route.ts.
  const cancelledAt = new Date().toISOString();
  await admin
    .from("student_subscriptions")
    .update({ status: "cancelled", cancelled_at: cancelledAt })
    .eq("id", subscription.id);

  return NextResponse.json({
    status: "cancelled",
    currentPeriodEnd: subscription.current_period_end,
  });
}
