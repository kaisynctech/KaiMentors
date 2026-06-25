import { NextResponse } from "next/server";
import { z } from "zod";
import { hashAccountSetupValue } from "@/lib/account-setup";
import { canSendAuthEmail } from "@/lib/auth-email-policy";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_TRADING_LEVELS = new Set(["beginner", "intermediate", "advanced", "funded"]);
const VALID_YEARS_TRADING = new Set(["less_than_1", "1_to_3", "3_to_5", "5_plus"]);

const registrationSchema = z.object({
  portalSlug: z.string().min(1),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().max(320),
  phoneNumber: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^\+?[0-9 ()-]+$/),
  password: z.string().min(10).max(128),
  consent: z.literal(true),
  tradingLevel: z.string().nullable().optional(),
  yearsTrading: z.string().nullable().optional(),
  tradingChallenge: z.string().max(500).nullable().optional(),
});

async function resolveRegistrationPortal(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  request: Request,
  submittedPortalSlug: string,
) {
  const hostname = normalizeRequestHostname(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      "",
  );

  if (hostname && !isPlatformHostname(hostname)) {
    const { data, error } = await admin.rpc("resolve_public_website_domain", {
      target_hostname: hostname,
    });
    if (error) return null;
    const resolution = Array.isArray(data) ? data[0] : data;
    if (!resolution?.portal_id) return null;

    const { data: portal } = await admin
      .from("portals")
      .select("id,trader_id,slug,is_published")
      .eq("id", resolution.portal_id)
      .eq("is_published", true)
      .maybeSingle();
    return portal;
  }

  const { data: portal } = await admin
    .from("portals")
    .select("id,trader_id,slug,is_published")
    .eq("slug", submittedPortalSlug)
    .eq("is_published", true)
    .maybeSingle();
  return portal;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const tradingLevelRaw = formData.get("tradingLevel")?.toString() || null;
  const yearsRaw = formData.get("yearsTrading")?.toString() || null;
  if (tradingLevelRaw && !VALID_TRADING_LEVELS.has(tradingLevelRaw)) {
    return NextResponse.json({ error: "Invalid trading level." }, { status: 422 });
  }
  if (yearsRaw && !VALID_YEARS_TRADING.has(yearsRaw)) {
    return NextResponse.json({ error: "Invalid years trading value." }, { status: 422 });
  }

  const parsed = registrationSchema.safeParse({
    portalSlug: formData.get("portalSlug"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    password: formData.get("password"),
    consent: formData.get("consent") === "on",
    tradingLevel: tradingLevelRaw,
    yearsTrading: yearsRaw,
    tradingChallenge: formData.get("tradingChallenge")?.toString() || null,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the registration details and try again." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Registration is not configured." },
      { status: 503 },
    );
  }

  const input = parsed.data;
  const validPortal = await resolveRegistrationPortal(
    admin,
    request,
    input.portalSlug,
  );
  if (!validPortal) {
    return NextResponse.json(
      { error: "This academy is not accepting applications right now." },
      { status: 400 },
    );
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      user_metadata: { full_name: input.fullName, role: "student" },
    });

  if (createError || !created.user) {
    const isDuplicate = createError?.message.toLowerCase().includes("already");
    if (!isDuplicate) {
      return NextResponse.json(
        { error: "Your account could not be created." },
        { status: 400 },
      );
    }

    // Existing user — look up their ID and create an application for this portal if they don't already have one.
    // listUsers + filter is the only available mechanism in supabase-js v2 (no getUserByEmail).
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingAuthUser = userList?.users.find(
      (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
    );
    if (!existingAuthUser) {
      // Can't resolve the user — safe enumeration-resistant fallback.
      return NextResponse.json({ status: "accepted", email: input.email, existingUser: true }, { status: 202 });
    }
    const existingUserId = existingAuthUser.id;

    const { data: existingApp } = await admin
      .from("student_applications")
      .select("id")
      .eq("student_user_id", existingUserId)
      .eq("portal_id", validPortal.id)
      .maybeSingle();

    if (!existingApp) {
      await admin.from("student_applications").insert({
        id: crypto.randomUUID(),
        trader_id: validPortal.trader_id,
        portal_id: validPortal.id,
        student_user_id: existingUserId,
        trader_broker_account_id: null,
        broker_account_identifier: null,
        trading_account_number: null,
        platform_account_number: null,
        phone_number: input.phoneNumber,
        status: "pending",
        consented_at: new Date().toISOString(),
        trading_level: input.tradingLevel ?? null,
        years_trading: input.yearsTrading ?? null,
        trading_challenge: input.tradingChallenge ?? null,
      });
      // Ignore insert error — existing user keeps their account regardless.
    }

    // Send OTP — same delivery gate as new-user path.
    const deliveryAllowed = await canSendAuthEmail(admin, existingUserId);
    if (deliveryAllowed) {
      const { error: otpError } = await admin.auth.signInWithOtp({
        email: input.email,
        options: { shouldCreateUser: false },
      });
      await admin.from("auth_challenge_events").insert({
        user_id: existingUserId,
        purpose: "student_registration",
        event_type: otpError ? "provider_error" : "requested",
        email_hash: hashAccountSetupValue(input.email),
        metadata: otpError
          ? { provider: "supabase_auth", error_code: "delivery_failed" }
          : {},
      });
    } else {
      await admin.from("auth_challenge_events").insert({
        user_id: existingUserId,
        purpose: "student_registration",
        event_type: "suppressed",
        email_hash: hashAccountSetupValue(input.email),
        metadata: { reason: "auth_email_canary_gate" },
      });
    }

    return NextResponse.json(
      { status: "accepted", email: input.email, existingUser: true },
      { status: 202 },
    );
  }

  const applicationId = crypto.randomUUID();
  const { error: applicationError } = await admin
    .from("student_applications")
    .insert({
      id: applicationId,
      trader_id: validPortal.trader_id,
      portal_id: validPortal.id,
      student_user_id: created.user.id,
      trader_broker_account_id: null,
      broker_account_identifier: null,
      trading_account_number: null,
      platform_account_number: null,
      phone_number: input.phoneNumber,
      status: "pending",
      consented_at: new Date().toISOString(),
      trading_level: input.tradingLevel ?? null,
      years_trading: input.yearsTrading ?? null,
      trading_challenge: input.tradingChallenge ?? null,
    });

  if (applicationError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Your application could not be saved." },
      { status: 400 },
    );
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ phone: input.phoneNumber })
    .eq("id", created.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Your student profile could not be saved." },
      { status: 400 },
    );
  }

  // Send OTP — gated by platform delivery policy; audit trail written in both branches.
  const deliveryAllowed = await canSendAuthEmail(admin, created.user.id);
  if (deliveryAllowed) {
    const { error: otpError } = await admin.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: false },
    });
    await admin.from("auth_challenge_events").insert({
      user_id: created.user.id,
      purpose: "student_registration",
      event_type: otpError ? "provider_error" : "requested",
      email_hash: hashAccountSetupValue(input.email),
      metadata: otpError
        ? { provider: "supabase_auth", error_code: "delivery_failed" }
        : {},
    });
  } else {
    await admin.from("auth_challenge_events").insert({
      user_id: created.user.id,
      purpose: "student_registration",
      event_type: "suppressed",
      email_hash: hashAccountSetupValue(input.email),
      metadata: { reason: "auth_email_canary_gate" },
    });
  }

  return NextResponse.json(
    {
      status: "accepted",
      email: input.email,
    },
    { status: 202 },
  );
}
