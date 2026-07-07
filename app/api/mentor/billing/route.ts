import { NextResponse } from "next/server";
import { getSubscriptionSummary } from "@/lib/entitlements";
import { getMentorWorkspace } from "@/lib/workspace";

export async function GET() {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await getSubscriptionSummary(workspace.traderId);
  if (!summary) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  return NextResponse.json({ summary });
}
