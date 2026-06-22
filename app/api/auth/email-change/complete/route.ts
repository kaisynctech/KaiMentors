import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ newEmail: z.string().trim().email().max(320).transform((value) => value.toLowerCase()) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the email address." }, { status: 400 });
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!admin || !user?.email) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (user.email.toLowerCase() !== parsed.data.newEmail) return NextResponse.json({ error: "Both email codes must be verified first." }, { status: 409 });
  const { data: membership } = await admin.from("trader_members").select("trader_id,role").eq("user_id", user.id).eq("role", "owner").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace owner access is required." }, { status: 403 });
  const { data: profile } = await admin.from("profiles").select("email").eq("id", user.id).single();
  const { error } = await admin.from("profiles").update({ email: parsed.data.newEmail }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "The profile email could not be synchronized." }, { status: 500 });
  await Promise.all([
    admin.from("audit_logs").insert({ trader_id: membership.trader_id, actor_user_id: user.id, actor_role: "trader", action: "owner_email_verified", entity_type: "profiles", entity_id: user.id, old_data: { email: profile?.email ?? null }, new_data: { email: parsed.data.newEmail } }),
    admin.from("auth_challenge_events").insert({ user_id: user.id, purpose: "email_change", event_type: "verified", email_hash: createHash("sha256").update(parsed.data.newEmail).digest("hex") }),
  ]);
  return NextResponse.json({ status: "updated" });
}
