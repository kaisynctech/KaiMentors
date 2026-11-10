"use server";

import { revalidatePath } from "next/cache";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

export async function markReferralCommissionPaid(formData: FormData) {
  const commissionId = String(formData.get("commissionId") ?? "");
  if (!commissionId) return;
  const workspace = await getMentorWorkspace();
  if (!workspace) return;
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "referrals",
      workspace.accessModel,
    )
  ) {
    return;
  }
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("referral_commissions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", commissionId)
    .eq("trader_id", workspace.traderId)
    .eq("status", "owed");
  revalidatePath("/dashboard/referrals");
}
