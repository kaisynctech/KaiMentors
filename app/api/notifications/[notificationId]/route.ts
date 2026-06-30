import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ notificationId: z.string().uuid() });

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", params.data.notificationId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
  return NextResponse.json({ updated: true });
}
