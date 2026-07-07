import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  traderId: z.string().uuid(),
  origin: z.string().url(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

async function assertVerifiedStudent(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  traderId: string,
) {
  const { data } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", userId)
    .eq("trader_id", traderId)
    .eq("status", "verified")
    .maybeSingle();

  return Boolean(data);
}

export async function POST(request: Request) {
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const allowed = await assertVerifiedStudent(
    supabase,
    user.id,
    parsed.data.traderId,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Verified academy access is required." },
      { status: 403 },
    );
  }

  const userAgent = request.headers.get("user-agent");
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      trader_id: parsed.data.traderId,
      endpoint: parsed.data.subscription.endpoint,
      p256dh: parsed.data.subscription.keys.p256dh,
      auth: parsed.data.subscription.keys.auth,
      origin: parsed.data.origin,
      user_agent: userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    return NextResponse.json(
      { error: "The subscription could not be saved." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);

  if (error) {
    return NextResponse.json(
      { error: "The subscription could not be removed." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
