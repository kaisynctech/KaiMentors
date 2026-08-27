import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const portalSlug = searchParams.get("portal");

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service not available." }, { status: 503 });
  }

  let query = admin
    .from("student_subscriptions")
    .select("status,plan_id,current_period_end,payfast_token,portal:portals!inner(slug)")
    .eq("student_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (portalSlug) {
    query = query.eq("portal.slug", portalSlug);
  }

  const { data } = await query.abortSignal(AbortSignal.timeout(10000)).maybeSingle();

  if (!data) {
    return NextResponse.json({
      status: null,
      planId: null,
      currentPeriodEnd: null,
      payfastToken: null,
    });
  }

  return NextResponse.json({
    status: data.status,
    planId: data.plan_id,
    currentPeriodEnd: data.current_period_end,
    payfastToken: data.payfast_token,
  });
}
