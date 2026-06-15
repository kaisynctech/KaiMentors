import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const registrationSchema = z.object({
  portalId: z.string().uuid(),
  portalSlug: z.string().min(1),
  traderId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().max(320),
  password: z.string().min(10).max(72),
  phoneNumber: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^\+?[0-9 ()-]+$/),
  brokerConnectionId: z.string().uuid(),
  tradingAccountNumber: z.string().trim().min(3).max(120),
  platformAccountNumber: z.string().trim().min(3).max(120),
  consent: z.literal(true),
});

const allowedProofTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = registrationSchema.safeParse({
    portalId: formData.get("portalId"),
    portalSlug: formData.get("portalSlug"),
    traderId: formData.get("traderId"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phoneNumber: formData.get("phoneNumber"),
    brokerConnectionId: formData.get("brokerConnectionId"),
    tradingAccountNumber: formData.get("tradingAccountNumber"),
    platformAccountNumber: formData.get("platformAccountNumber"),
    consent: formData.get("consent") === "on",
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

  const [{ data: validPortal }, { data: validConnection }] = await Promise.all([
    admin
      .from("portals")
      .select("id")
      .eq("id", input.portalId)
      .eq("trader_id", input.traderId)
      .eq("slug", input.portalSlug)
      .eq("is_published", true)
      .maybeSingle(),
    admin
      .from("trader_broker_accounts")
      .select(
        "id,broker_id,verification_method,broker:brokers(adapter_key)",
      )
      .eq("id", input.brokerConnectionId)
      .eq("trader_id", input.traderId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!validPortal || !validConnection) {
    return NextResponse.json(
      { error: "This broker option is no longer available." },
      { status: 400 },
    );
  }

  const proof = formData.get("screenshotProof");
  if (proof instanceof File && proof.size > 0) {
    if (!allowedProofTypes.has(proof.type) || proof.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Use a PNG, JPG, or WebP screenshot smaller than 10 MB." },
        { status: 400 },
      );
    }
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
    return NextResponse.json(
      {
        error: isDuplicate
          ? "An account with this email already exists. Sign in to continue."
          : "Your account could not be created.",
      },
      { status: isDuplicate ? 409 : 400 },
    );
  }

  const initialStatus =
    validConnection.verification_method === "api"
      ? "pending"
      : "manual_review";
  const applicationId = crypto.randomUUID();
  const { data: application, error: applicationError } = await admin
    .from("student_applications")
    .insert({
      id: applicationId,
      trader_id: input.traderId,
      portal_id: input.portalId,
      student_user_id: created.user.id,
      trader_broker_account_id: input.brokerConnectionId,
      broker_account_identifier: input.tradingAccountNumber,
      phone_number: input.phoneNumber,
      trading_account_number: input.tradingAccountNumber,
      platform_account_number: input.platformAccountNumber,
      status: initialStatus,
      consented_at: new Date().toISOString(),
    })
    .select("id")
    .single();

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

  let screenshotPath: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    const extension = allowedProofTypes.get(proof.type);
    screenshotPath = `${input.traderId}/${applicationId}/proof.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("verification-proofs")
      .upload(screenshotPath, proof, {
        cacheControl: "3600",
        contentType: proof.type,
        upsert: false,
      });
    if (uploadError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        { error: "Your screenshot proof could not be uploaded." },
        { status: 400 },
      );
    }

    const { error: proofUpdateError } = await admin
      .from("student_applications")
      .update({ screenshot_path: screenshotPath })
      .eq("id", applicationId);
    if (proofUpdateError) {
      await admin.storage.from("verification-proofs").remove([screenshotPath]);
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        { error: "Your screenshot proof could not be linked." },
        { status: 400 },
      );
    }
  }

  const broker = Array.isArray(validConnection.broker)
    ? validConnection.broker[0]
    : validConnection.broker;
  const { error: attemptError } = await admin
    .from("verification_attempts")
    .insert({
      trader_id: input.traderId,
      application_id: application.id,
      broker_id: validConnection.broker_id,
      request_id: crypto.randomUUID(),
      status: initialStatus,
      verification_method: validConnection.verification_method,
      adapter_key:
        validConnection.verification_method === "api"
          ? broker?.adapter_key ?? "http-json-v1"
          : validConnection.verification_method,
      response_summary: {
        screenshotProvided: Boolean(screenshotPath),
        tradingAccountProvided: true,
        platformAccountProvided: true,
      },
    });
  if (attemptError) {
    if (screenshotPath) {
      await admin.storage.from("verification-proofs").remove([screenshotPath]);
    }
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Your verification record could not be created." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      applicationId: application.id,
      status: initialStatus,
      email: input.email,
    },
    { status: 201 },
  );
}
