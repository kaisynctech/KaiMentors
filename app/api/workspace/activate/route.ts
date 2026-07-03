import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const traderId = typeof body?.traderId === "string" ? body.traderId : null;
  if (!traderId) {
    return NextResponse.json({ error: "traderId required." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // getSession() reads the JWT from cookies locally — no Supabase auth API
  // round-trip. The access token was just issued by signInWithPassword so it
  // is guaranteed fresh; no refresh call is needed.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const sig = AbortSignal.timeout(5000);
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", userId)
    .eq("trader_id", traderId)
    .abortSignal(sig)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("km_workspace", traderId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
