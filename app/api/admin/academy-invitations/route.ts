import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";
import { canSendAuthEmail, getAuthEmailDeliveryPolicy } from "@/lib/auth-email-policy";

const schema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(120),
  portalSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  packageId: z.string().uuid().nullable(),
  environment: z.enum(["production", "acceptance_test"]).default("production"),
});

export async function POST(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (!actor) return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the academy invitation details." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server onboarding is not configured." }, { status: 503 });
  const input = parsed.data;
  const deliveryPolicy = await getAuthEmailDeliveryPolicy(admin);
  if (deliveryPolicy.mode === "canary_only" && input.environment !== "acceptance_test") {
    return NextResponse.json(
      { error: "Production academy invitations are paused until the OTP email canary is approved." },
      { status: 503 },
    );
  }

  const [{ data: existingProfile }, { data: existingPortal }, packageResult] = await Promise.all([
    admin.from("profiles").select("id").ilike("email", input.email).maybeSingle(),
    admin.from("portals").select("id").eq("slug", input.portalSlug).maybeSingle(),
    input.packageId ? admin.from("custom_site_packages").select("id").eq("id", input.packageId).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (existingProfile || existingPortal) return NextResponse.json({ error: "That owner or academy address already exists." }, { status: 409 });
  if (input.packageId && !packageResult.data) return NextResponse.json({ error: "The selected package is unavailable." }, { status: 400 });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: false,
    user_metadata: { full_name: input.fullName, role: "trader", invited_by: actor.user.id },
  });
  if (createError || !created.user) return NextResponse.json({ error: "The owner account could not be created." }, { status: 400 });

  const { data: provisioned, error: provisionError } = await admin.rpc("provision_invited_academy", {
    target_user_id: created.user.id,
    target_email: input.email,
    target_full_name: input.fullName,
    target_legal_name: input.legalName,
    target_display_name: input.displayName,
    target_slug: input.portalSlug,
    target_package_id: input.packageId,
    target_environment: input.environment,
    target_invited_by: actor.user.id,
    target_timezone: "Africa/Johannesburg",
  });
  if (provisionError || !provisioned) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Atomic workspace provisioning failed." }, { status: 400 });
  }
  if (!(await canSendAuthEmail(admin, created.user.id))) {
    await admin.from("auth_challenge_events").insert({
      user_id: created.user.id,
      purpose: "invitation",
      event_type: "suppressed",
      email_hash: createHash("sha256").update(input.email).digest("hex"),
      metadata: { reason: "auth_email_canary_gate" },
    });
    return NextResponse.json({ status: "provisioned_email_blocked", ...provisioned }, { status: 201 });
  }
  const { error: emailError } = await admin.auth.signInWithOtp({ email: input.email, options: { shouldCreateUser: false } });
  await admin.from("auth_challenge_events").insert({
    user_id: created.user.id,
    purpose: "invitation",
    event_type: emailError ? "provider_error" : "requested",
    email_hash: createHash("sha256").update(input.email).digest("hex"),
    metadata: emailError ? { provider: "supabase_auth", error_code: "delivery_failed" } : {},
  });
  return NextResponse.json({
    status: emailError ? "provisioned_email_pending" : "invited",
    ...provisioned,
    emailWarning: emailError?.message ?? null,
  }, { status: 201 });
}
