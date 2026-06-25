import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const verifySchema = z.object({
  portalId: z.string().uuid(),
  accountNumber: z.string().trim().min(3).max(120).optional(),
  brokerConnectionId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  // Step 1 — Authentication
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

  // Get access token to forward to Edge Function
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "student") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Step 2 — Input validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { portalId, accountNumber, brokerConnectionId } = parsed.data;

  // Use admin client for all DB writes from here
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service not available." }, { status: 503 });
  }

  // Step 3 — Load application
  const { data: application } = await admin
    .from("student_applications")
    .select("id, trader_id, portal_id, status, student_user_id")
    .eq("student_user_id", user.id)
    .eq("portal_id", portalId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) {
    return NextResponse.json({ error: "No application found." }, { status: 404 });
  }
  if (application.status === "verified") {
    return NextResponse.json({ error: "Application is already verified." }, { status: 400 });
  }
  if (application.status === "rejected") {
    return NextResponse.json({ error: "Application has been rejected." }, { status: 400 });
  }

  // Step 4 — Rate limit: max 5 attempts per hour
  const { count: attemptCount } = await admin
    .from("verification_attempts")
    .select("id", { count: "exact", head: true })
    .eq("application_id", application.id)
    .gt(
      "created_at",
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    );

  if ((attemptCount ?? 0) >= 5) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait before trying again." },
      { status: 429 },
    );
  }

  // Step 5 — Load broker connections for this trader
  const connectionsQuery = admin
    .from("trader_broker_accounts")
    .select("id, broker_id, verification_method, broker:brokers(name, is_active)")
    .eq("trader_id", application.trader_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const { data: connectionsRaw } = brokerConnectionId
    ? await connectionsQuery.eq("id", brokerConnectionId)
    : await connectionsQuery;

  // Enforce tenant isolation: if a specific connection was requested, verify it belongs to this trader
  if (brokerConnectionId && (!connectionsRaw || connectionsRaw.length === 0)) {
    return NextResponse.json({ error: "Broker connection not found." }, { status: 400 });
  }

  const connections = (connectionsRaw ?? []).filter((c) => {
    const b = Array.isArray(c.broker) ? c.broker[0] : c.broker;
    return b && (b as { is_active: boolean }).is_active === true;
  });

  const apiConnections = connections.filter((c) => c.verification_method === "api");
  const apiConnectionsExisted = apiConnections.length > 0;

  // Step 6 — Try API connections via Edge Function
  for (const connection of apiConnections) {
    // Pre-set the broker connection on the application — EF reads trader_broker_account_id
    await admin
      .from("student_applications")
      .update({
        trader_broker_account_id: connection.id,
        broker_account_identifier: accountNumber ?? null,
        trading_account_number: accountNumber ?? null,
      })
      .eq("id", application.id);

    // Invoke Edge Function with the student's JWT (EF validates student_user_id ownership)
    const { data: efResult, error: efError } = await admin.functions.invoke(
      "verify-broker-account",
      {
        body: { applicationId: application.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (!efError && efResult && (efResult as { status?: string }).status === "verified") {
      // EF has already updated application status and created verification_attempts internally.
      await admin.from("audit_logs").insert({
        trader_id: application.trader_id,
        actor_user_id: user.id,
        action: "student.verification.verified",
        entity_type: "student_applications",
        entity_id: application.id,
        metadata: {
          triggeredFrom: "student_dashboard",
          brokerConnectionId: connection.id,
          accountNumberProvided: Boolean(accountNumber),
        },
      });
      return NextResponse.json({ status: "verified" });
    }
    // EF returned manual_review or error — try next connection
  }

  // Step 7 — No API connection verified: transition to manual_review
  const selectedConnection =
    brokerConnectionId
      ? connections.find((c) => c.id === brokerConnectionId) ?? connections[0] ?? null
      : (connections.find((c) => c.verification_method !== "api") ?? connections[0] ?? null);

  await admin
    .from("student_applications")
    .update({
      status: "manual_review",
      trader_broker_account_id: selectedConnection?.id ?? null,
      broker_account_identifier: accountNumber ?? null,
      trading_account_number: accountNumber ?? null,
    })
    .eq("id", application.id);

  if (selectedConnection) {
    await admin.from("verification_attempts").insert({
      trader_id: application.trader_id,
      application_id: application.id,
      broker_id: selectedConnection.broker_id,
      request_id: crypto.randomUUID(),
      status: "manual_review",
      verification_method: selectedConnection.verification_method,
      adapter_key: "dashboard-manual",
      response_summary: {
        triggeredFrom: "student_dashboard",
        accountNumberProvided: Boolean(accountNumber),
        reason: apiConnectionsExisted ? "api_verification_failed" : "no_api_broker",
      },
    });
  }

  await admin.from("audit_logs").insert({
    trader_id: application.trader_id,
    actor_user_id: user.id,
    action: "student.verification.manual_review",
    entity_type: "student_applications",
    entity_id: application.id,
    metadata: {
      triggeredFrom: "student_dashboard",
      brokerConnectionId: selectedConnection?.id ?? null,
      accountNumberProvided: Boolean(accountNumber),
    },
  });

  return NextResponse.json({ status: "manual_review" });
}
