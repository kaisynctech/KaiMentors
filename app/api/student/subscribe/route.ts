import { NextResponse } from "next/server";
import { z } from "zod";
import { buildPayFastFormFields, getProcessUrl } from "@/lib/payfast";
import { getPlanById } from "@/lib/subscription-plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";

const subscribeSchema = z.object({
  planId: z.enum(["basic", "intermediate", "pro"]),
  portalSlug: z.string().min(1),
});

interface PortalRow {
  id: string;
  slug: string;
  access_model: string;
  portal_name: string;
}

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { planId, portalSlug } = parsed.data;

  const plan = getPlanById(planId);
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service not available." }, { status: 503 });
  }

  // Step 1 — load the student's application + portal, verify subscription access_model.
  const { data: application } = await admin
    .from("student_applications")
    .select(
      "id,trader_id,portal_id,status,portal:portals!inner(id,slug,access_model,portal_name)",
    )
    .eq("student_user_id", user.id)
    .eq("portal.slug", portalSlug)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();

  if (!application) {
    return NextResponse.json(
      { error: "No application found for this academy." },
      { status: 404 },
    );
  }

  const portal = (
    Array.isArray(application.portal) ? application.portal[0] : application.portal
  ) as PortalRow | null;
  if (!portal || portal.access_model !== "subscription") {
    return NextResponse.json(
      { error: "This academy does not use subscription billing." },
      { status: 400 },
    );
  }

  // Step 2 — verify no existing active subscription.
  const { data: existingActive } = await admin
    .from("student_subscriptions")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("portal_id", portal.id)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  if (existingActive) {
    return NextResponse.json(
      { error: "You already have an active subscription." },
      { status: 400 },
    );
  }

  // Step 3 — create the pending subscription row; its id becomes m_payment_id.
  const { data: subscriptionRow, error: insertError } = await admin
    .from("student_subscriptions")
    .insert({
      student_application_id: application.id,
      student_user_id: user.id,
      trader_id: application.trader_id,
      portal_id: portal.id,
      plan_id: plan.id,
      status: "pending",
      amount_cents: plan.amountCents,
    })
    .select("id")
    .single();

  if (insertError || !subscriptionRow) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  // Step 4 — student name/email for the PayFast form.
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  const fullName = (profile?.full_name ?? "").trim();
  const [nameFirst, ...rest] = fullName.split(/\s+/).filter(Boolean);
  const nameLast = rest.join(" ");

  // Build return/cancel URLs on the same origin the checkout was initiated from (works
  // for both the platform domain and a future custom domain), and the ITN notify_url from
  // the authoritative platform URL — the brief hardcodes "https://kaimentors.com", which
  // won't match every deployment; NEXT_PUBLIC_SITE_URL is the platform's real origin.
  const requestOrigin = new URL(request.url).origin;
  const academy = await getStudentAcademyContext(portalSlug);
  const dashboardPath = `${academy.basePath}${academy.querySuffix}`;
  const joinChar = dashboardPath.includes("?") ? "&" : "?";
  const returnUrl = `${requestOrigin}${dashboardPath}${joinChar}subscribed=1`;
  const cancelUrl = `${requestOrigin}${dashboardPath}${joinChar}cancelled=1`;
  const notifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin}/api/webhooks/payfast`;

  const today = new Date().toISOString().slice(0, 10);
  const amountStr = plan.amountZAR.toFixed(2);

  const fields = buildPayFastFormFields({
    merchant_id: process.env.PAYFAST_MERCHANT_ID ?? "",
    merchant_key: process.env.PAYFAST_MERCHANT_KEY ?? "",
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    name_first: nameFirst || "Student",
    name_last: nameLast || "",
    email_address: user.email ?? "",
    m_payment_id: subscriptionRow.id,
    amount: amountStr,
    item_name: `${portal.portal_name} – ${plan.label} Plan`,
    subscription_type: "1",
    billing_date: today,
    recurring_amount: amountStr,
    frequency: "3",
    cycles: "0",
    custom_str1: subscriptionRow.id,
  });

  return NextResponse.json({ fields, actionUrl: getProcessUrl() });
}
