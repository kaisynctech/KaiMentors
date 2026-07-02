import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const params = z.object({ userId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!traderId) return NextResponse.json({ error: "traderId required." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: callerMembership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can remove mentors." },
      { status: 403 },
    );
  }

  const targetUserId = params.data.userId;

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  // Block removal if mentor has upcoming confirmed bookings
  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id")
    .eq("trader_id", callerMembership.trader_id)
    .eq("mentor_user_id", targetUserId)
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .limit(1);

  if (upcoming && upcoming.length > 0) {
    return NextResponse.json(
      {
        error:
          "This mentor has upcoming confirmed bookings. Cancel or reassign them first.",
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { error } = await admin
    .from("trader_members")
    .delete()
    .eq("trader_id", callerMembership.trader_id)
    .eq("user_id", targetUserId);

  if (error) return NextResponse.json({ error: "Could not remove mentor." }, { status: 500 });
  return NextResponse.json({ removed: targetUserId });
}
