import { NextResponse }       from "next/server";
import { z }                  from "zod";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";

const schema = z.object({
  workspaceToken: z.string().uuid(),
  firstName:      z.string().trim().min(1).max(80),
  lastName:       z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // getSession() decodes the JWT from cookies locally — no network call.
  // The user just completed verifyOtp on the client, so their session is fresh.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { workspaceToken, firstName, lastName } = parsed.data;
  const fullName = `${firstName} ${lastName}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  const sig = AbortSignal.timeout(10000);

  const { data: trader } = await admin
    .from("traders")
    .select("id")
    .eq("invite_token", workspaceToken)
    .abortSignal(sig)
    .maybeSingle();

  if (!trader) {
    return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
  }

  // Idempotent: if the user is already a member, just let them through.
  const { data: existing } = await admin
    .from("trader_members")
    .select("id")
    .eq("trader_id", trader.id)
    .eq("user_id", user.id)
    .abortSignal(sig)
    .maybeSingle();

  if (!existing) {
    await Promise.all([
      admin
        .from("profiles")
        .upsert(
          { id: user.id, full_name: fullName, role: "trader" },
          { onConflict: "id" },
        )
        .abortSignal(sig),
      admin
        .from("trader_members")
        .upsert(
          { trader_id: trader.id, user_id: user.id, role: "mentor" },
          { onConflict: "trader_id,user_id", ignoreDuplicates: true },
        )
        .abortSignal(sig),
    ]);
  }

  return NextResponse.json({ ok: true });
}
