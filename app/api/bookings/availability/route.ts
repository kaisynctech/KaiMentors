import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "End time must be after start time.",
  });

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
  return membership ? { user, tid: membership.trader_id } : null;
}

export async function GET() {
  const supabase = await createClient();
  const ctx = await getMembership(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data } = await supabase!
    .from("mentor_availability")
    .select("id,day_of_week,start_time,end_time,is_active")
    .eq("trader_id", ctx.tid)
    .order("day_of_week")
    .order("start_time");

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

  const { data, error } = await supabase!
    .from("mentor_availability")
    .insert({
      trader_id: ctx.tid,
      day_of_week: parsed.data.dayOfWeek,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not save availability." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
