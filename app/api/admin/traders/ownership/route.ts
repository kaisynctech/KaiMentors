import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/admin-api";
const schema = z.object({ traderId: z.string().uuid(), toUserId: z.string().uuid(), reason: z.string().trim().min(10).max(500) });
export async function POST(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (!actor) return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the ownership transfer details." }, { status: 400 });
  const { data: trader } = await actor.supabase.from("traders").select("owner_user_id").eq("id", parsed.data.traderId).maybeSingle();
  if (!trader) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  const { data: transfer, error } = await actor.supabase.from("trader_ownership_transfers").insert({ trader_id: parsed.data.traderId, from_user_id: trader.owner_user_id, to_user_id: parsed.data.toUserId, requested_by: actor.user.id, reason: parsed.data.reason }).select("id").single();
  if (error || !transfer) return NextResponse.json({ error: "Ownership transfer could not be recorded." }, { status: 400 });
  const { error: completeError } = await actor.supabase.rpc("complete_trader_ownership_transfer", { target_transfer_id: transfer.id });
  if (completeError) return NextResponse.json({ error: "Ownership transfer validation failed." }, { status: 409 });
  return NextResponse.json({ status: "completed", transferId: transfer.id });
}
