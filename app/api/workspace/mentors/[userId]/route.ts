import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const params = z.object({ userId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!z.string().uuid().safeParse(traderId).success) {
    return NextResponse.json({ error: "traderId required." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // Single round-trip: all auth checks + delete happen inside the function.
  const { data: result, error: rpcErr } = await supabase
    .rpc("remove_mentor_from_workspace", {
      p_trader_id:      traderId,
      p_target_user_id: params.data.userId,
    })
    .abortSignal(AbortSignal.timeout(10000));

  if (rpcErr) {
    return NextResponse.json({ error: "Could not remove mentor." }, { status: 500 });
  }

  const res = result as {
    ok?: boolean;
    removed?: string;
    error?: string;
    http_status?: number;
  };

  if (!res?.ok) {
    const httpStatus = res?.http_status ?? 400;
    const message =
      res?.error === "unauthorized"
        ? "Only the workspace owner can remove mentors."
        : res?.error === "self_remove"
          ? "You cannot remove yourself."
          : res?.error === "has_bookings"
            ? "This mentor has upcoming confirmed bookings. Cancel or reassign them first."
            : "Could not remove mentor.";
    return NextResponse.json({ error: message }, { status: httpStatus });
  }

  return NextResponse.json({ removed: params.data.userId });
}
