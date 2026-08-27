import { NextResponse } from "next/server";
import { validateITN } from "@/lib/payfast";
import { createAdminClient } from "@/lib/supabase/admin";

// PayFast ITN webhook. Public endpoint — no session auth, trust is established entirely
// by validateITN() (signature + PayFast's own server-side postback validation).
//
// MB-118 NOTE: the brief lists "payment_status === COMPLETE" and "m_payment_id row is in
// pending status" as universal validation steps inside the shared validator. Taken
// literally that makes the CANCELLED/FAILED branches below unreachable (see the long
// comment in lib/payfast.ts). Those checks are applied here instead, scoped to the
// specific branch they actually apply to.
//
// Always returns 200 once the notification has been authenticity-checked, even when we
// choose not to act on it — PayFast retries non-200 responses, and retrying a
// request that failed for a reason that won't change (bad signature, unknown
// m_payment_id) just wastes their retry budget and ours.

function alwaysOk(reason: string, extra?: Record<string, unknown>) {
  console.warn(`[payfast-itn] ${reason}`, extra ?? {});
  return NextResponse.json({ received: true }, { status: 200 });
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    body = Object.fromEntries(params.entries());
  } catch {
    return alwaysOk("unparseable_body");
  }

  const validation = await validateITN(body);
  if (!validation.valid) {
    return alwaysOk("itn_validation_failed", { reason: validation.reason });
  }

  const paymentId = body.m_payment_id;
  if (!paymentId) {
    return alwaysOk("missing_m_payment_id");
  }

  const admin = createAdminClient();
  if (!admin) {
    return alwaysOk("admin_client_unavailable");
  }

  const { data: subscription } = await admin
    .from("student_subscriptions")
    .select("id,student_application_id,amount_cents,status")
    .eq("id", paymentId)
    .abortSignal(AbortSignal.timeout(6000))
    .maybeSingle();

  if (!subscription) {
    return alwaysOk("subscription_row_not_found", { paymentId });
  }

  // Redundant tamper-detection: custom_str1 was set to the same id at checkout initiation.
  if (body.custom_str1 && body.custom_str1 !== subscription.id) {
    return alwaysOk("custom_str1_mismatch", { paymentId });
  }

  const paymentStatus = body.payment_status;

  if (paymentStatus === "COMPLETE") {
    const grossAmount = Number.parseFloat(body.amount_gross ?? "");
    const expectedAmount = subscription.amount_cents / 100;
    if (!Number.isFinite(grossAmount) || Math.abs(grossAmount - expectedAmount) > 0.01) {
      return alwaysOk("amount_mismatch", {
        paymentId,
        expectedAmount,
        grossAmount: body.amount_gross,
      });
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 32 * 24 * 60 * 60 * 1000);

    await admin
      .from("student_subscriptions")
      .update({
        status: "active",
        payfast_token: body.token ?? null,
        payfast_payment_id: body.pf_payment_id ?? null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .eq("id", subscription.id);

    // Not required for module access (the subscription row itself gates that — see
    // has_student_module_access() in the MB-118 migration), but kept for accurate status
    // display elsewhere in the student dashboard.
    await admin
      .from("student_applications")
      .update({ status: "verified" })
      .eq("id", subscription.student_application_id);

    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (paymentStatus === "CANCELLED") {
    const now = new Date().toISOString();
    // Unlike the dashboard-initiated soft-cancel (see /api/student/cancel-subscription),
    // a PayFast-initiated CANCELLED notification ends the grace period immediately —
    // current_period_end is set to now() so has_student_module_access() stops granting
    // access on this row right away, matching the brief's "revoke access" intent for
    // this path specifically.
    await admin
      .from("student_subscriptions")
      .update({ status: "cancelled", cancelled_at: now, current_period_end: now })
      .eq("id", subscription.id);

    await admin
      .from("student_applications")
      .update({ status: "pending" })
      .eq("id", subscription.student_application_id);

    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (paymentStatus === "FAILED") {
    // Grace period intentionally left untouched — do not revoke access immediately.
    await admin
      .from("student_subscriptions")
      .update({ status: "payment_failed" })
      .eq("id", subscription.id);

    return NextResponse.json({ received: true }, { status: 200 });
  }

  return alwaysOk("unhandled_payment_status", { paymentStatus });
}
