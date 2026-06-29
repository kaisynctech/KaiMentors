import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(600).nullable().optional(),
    provider: z.enum(["zoom", "google_meet", "teams", "other"]),
    meetingId: z.string().trim().max(50).nullable().optional(),
    meetingPasscode: z.string().trim().max(50).nullable().optional(),
    joinUrl: z.string().url().nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().optional(),
    recordingEnabled: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.provider === "zoom" && !val.meetingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Meeting ID is required for Zoom.",
        path: ["meetingId"],
      });
    }
    if (val.provider !== "zoom" && !val.joinUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Join URL is required.",
        path: ["joinUrl"],
      });
    }
  });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 403 });

  const d = parsed.data;
  const { data, error } = await supabase
    .from("live_classes")
    .insert({
      trader_id: membership.trader_id,
      created_by: user.id,
      title: d.title,
      description: d.description ?? null,
      provider: d.provider,
      meeting_id: d.meetingId ?? null,
      meeting_passcode: d.meetingPasscode ?? null,
      join_url: d.joinUrl ?? null,
      starts_at: d.startsAt,
      ends_at: d.endsAt ?? null,
      recording_enabled: d.recordingEnabled ?? false,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not create class." }, { status: 500 });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
