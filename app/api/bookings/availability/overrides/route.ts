import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;

const createSchema = z.discriminatedUnion("isBlocked", [
  z.object({
    isBlocked: z.literal(true),
    overrideDate: z.string().regex(dateRegex, "Invalid date format."),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    isBlocked: z.literal(false),
    overrideDate: z.string().regex(dateRegex, "Invalid date format."),
    startTime: z.string().regex(timeRegex),
    endTime: z.string().regex(timeRegex),
    reason: z.string().trim().max(200).optional(),
  }),
]);

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return membership ? { tid: membership.trader_id, uid: user.id } : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const ctx = await getMembership(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? today;
  const to =
    url.searchParams.get("to") ??
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data } = await supabase!
    .from("availability_overrides")
    .select("id,override_date,start_time,end_time,is_blocked,reason")
    .eq("trader_id", ctx.tid)
    .eq("mentor_user_id", ctx.uid)
    .gte("override_date", from)
    .lte("override_date", to)
    .order("override_date");

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const ctx = await getMembership(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const d = parsed.data;
  if (!d.isBlocked && d.startTime >= d.endTime) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }
  const { data, error } = await supabase!
    .from("availability_overrides")
    .insert({
      trader_id: ctx.tid,
      mentor_user_id: ctx.uid,
      override_date: d.overrideDate,
      is_blocked: d.isBlocked,
      start_time: d.isBlocked ? null : d.startTime,
      end_time: d.isBlocked ? null : d.endTime,
      reason: d.reason ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not save override." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
