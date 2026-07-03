import { NextResponse }       from "next/server";
import { z }                  from "zod";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";

const schema = z.object({
  traderId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { traderId } = parsed.data;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  const sig = AbortSignal.timeout(10000);

  const { data: membership } = await admin
    .from("trader_members")
    .select("role")
    .eq("trader_id", traderId)
    .eq("user_id", user.id)
    .abortSignal(sig)
    .maybeSingle();

  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const newToken = crypto.randomUUID();

  const { data: updated } = await admin
    .from("traders")
    .update({ invite_token: newToken })
    .eq("id", traderId)
    .abortSignal(sig)
    .select("invite_token")
    .single();

  if (!updated?.invite_token) {
    return NextResponse.json({ error: "Could not reset link." }, { status: 500 });
  }

  return NextResponse.json({ inviteToken: updated.invite_token as string });
}
