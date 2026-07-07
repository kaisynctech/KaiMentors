import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Title and body are required." },
      { status: 400 },
    );
  }

  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: signalId, error } = await workspace.supabase.rpc(
    "post_daily_signal",
    {
      target_title: parsed.data.title,
      target_body: parsed.data.body,
    },
  );

  if (error || !signalId) {
    return NextResponse.json(
      { error: "The signal could not be posted." },
      { status: 400 },
    );
  }

  return NextResponse.json({ signalId }, { status: 201 });
}
