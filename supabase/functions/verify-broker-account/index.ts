import { createClient } from "jsr:@supabase/supabase-js@2";
import { getBrokerAdapter } from "./adapters/registry.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Function environment is incomplete." }, 500);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Unauthorized." }, 401);

  const { applicationId } = await request.json();
  if (typeof applicationId !== "string") {
    return json({ error: "applicationId is required." }, 400);
  }

  const { data: application, error } = await admin
    .from("student_applications")
    .select(`
      id,
      trader_id,
      student_user_id,
      broker_account_identifier,
      trader_broker_account:trader_broker_accounts!inner(
        id,
        partner_code,
        vault_secret_id,
        public_config,
        verification_method,
        broker:brokers!inner(id, adapter_key)
      )
    `)
    .eq("id", applicationId)
    .single();

  if (error || !application) return json({ error: "Application not found." }, 404);
  if (application.student_user_id !== userData.user.id) {
    return json({ error: "Forbidden." }, 403);
  }

  const connection = application.trader_broker_account;
  const broker = connection.broker;
  const requestId = crypto.randomUUID();

  if (connection.verification_method !== "api") {
    return json(
      { error: "This broker account uses a mentor review workflow." },
      409,
    );
  }

  await admin.from("student_applications").update({ status: "processing" }).eq("id", application.id);
  const { data: attempt } = await admin
    .from("verification_attempts")
    .insert({
      trader_id: application.trader_id,
      application_id: application.id,
      broker_id: broker.id,
      request_id: requestId,
      adapter_key: broker.adapter_key,
      verification_method: connection.verification_method,
    })
    .select("id")
    .single();

  try {
    const credentials = await loadCredentials(admin, connection.vault_secret_id);
    const adapter = getBrokerAdapter(broker.adapter_key);
    const result = await adapter.verifyAffiliateAccount({
      brokerAccountIdentifier: application.broker_account_identifier,
      partnerCode: connection.partner_code,
      credentials,
      publicConfig: connection.public_config ?? {},
    });

    const status = result.verified
      ? "verified"
      : result.requiresManualReview
        ? "manual_review"
        : "rejected";

    await admin
      .from("verification_attempts")
      .update({
        status,
        response_code: result.code,
        response_summary: result.summary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attempt?.id);

    await admin
      .from("student_applications")
      .update({
        status,
        status_reason: result.code,
        verified_at: result.verified ? new Date().toISOString() : null,
        broker_verified: result.verified,
        broker_verified_at: result.verified ? new Date().toISOString() : null,
      })
      .eq("id", application.id);

    return json({ status, requestId }, 200);
  } catch (verificationError) {
    const message =
      verificationError instanceof Error ? verificationError.message : "Verification failed.";

    await admin
      .from("verification_attempts")
      .update({
        status: "manual_review",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attempt?.id);

    await admin
      .from("student_applications")
      .update({ status: "manual_review", status_reason: "ADAPTER_ERROR" })
      .eq("id", application.id);

    return json({ status: "manual_review", requestId }, 202);
  }
});

async function loadCredentials(
  admin: ReturnType<typeof createClient>,
  secretId: string | null,
) {
  if (!secretId) return {};

  const { data, error } = await admin
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", secretId)
    .single();

  if (error || !data?.decrypted_secret) {
    throw new Error("Broker credentials could not be loaded.");
  }

  return JSON.parse(data.decrypted_secret);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
