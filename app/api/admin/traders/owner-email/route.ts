import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  traderId: z.string().uuid(),
  newEmail: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  reason: z.string().trim().min(10).max(500),
});

export async function POST(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (!actor) return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the email correction details." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Owner correction is unavailable." }, { status: 503 });
  const { data: trader } = await actor.supabase.from("traders").select("owner_user_id").eq("id", parsed.data.traderId).maybeSingle();
  if (!trader) return NextResponse.json({ error: "Academy not found." }, { status: 404 });
  const { data: profile } = await actor.supabase.from("profiles").select("email").eq("id", trader.owner_user_id).single();
  if (!profile) return NextResponse.json({ error: "Academy owner profile was not found." }, { status: 409 });
  const previousEmail = profile.email;
  const { data: previousIdentity } = await admin.auth.admin.getUserById(trader.owner_user_id);
  const { error: authError } = await admin.auth.admin.updateUserById(trader.owner_user_id, {
    email: parsed.data.newEmail,
    email_confirm: false,
  });
  if (authError) return NextResponse.json({ error: "The corrected identity could not be prepared." }, { status: 409 });
  const { data: correctionId, error: correctionError } = await actor.supabase.rpc("begin_academy_owner_email_correction", {
    target_trader_id: parsed.data.traderId,
    target_new_email: parsed.data.newEmail,
    target_reason: parsed.data.reason,
  });
  if (correctionError) {
    await admin.auth.admin.updateUserById(trader.owner_user_id, { email: previousEmail, email_confirm: Boolean(previousIdentity.user?.email_confirmed_at) });
    return NextResponse.json({ error: "The correction failed validation and was rolled back." }, { status: 409 });
  }
  return NextResponse.json({ status: "pending_verification", correctionId });
}
