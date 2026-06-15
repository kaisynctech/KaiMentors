import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  email: z.string().email().max(320),
  password: z.string().min(10).max(72),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check your details." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Onboarding is not configured." },
      { status: 503 },
    );
  }

  const input = parsed.data;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id,role")
    .ilike("email", input.email)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.role !== "trader") {
      return NextResponse.json(
        { error: "This email is already registered with another account type." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { status: "existing", email: input.email },
      { status: 200 },
    );
  }

  const { data: slugMatch } = await admin
    .from("portals")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();
  if (slugMatch) {
    return NextResponse.json(
      { error: "That portal address is already in use." },
      { status: 409 },
    );
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      user_metadata: { full_name: input.fullName, role: "trader" },
    });
  if (createError || !created.user) {
    return NextResponse.json(
      {
        error: createError?.message.toLowerCase().includes("already")
          ? "An account with this email already exists."
          : "Account creation failed.",
      },
      { status: 400 },
    );
  }

  const { error: provisionError } = await admin.rpc("provision_trader", {
    target_user_id: created.user.id,
    target_legal_name: input.legalName,
    target_display_name: input.displayName,
    target_slug: input.slug,
    target_timezone: "Africa/Johannesburg",
  });

  if (provisionError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Workspace provisioning failed." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { status: "created", email: input.email },
    { status: 201 },
  );
}
