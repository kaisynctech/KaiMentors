import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  MentorReferrals,
  type MentorReferralCommission,
} from "@/components/mentor-referrals";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MentorReferralsPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "referrals",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const { data } = admin
    ? await admin
        .from("referral_commissions")
        .select(
          "id,student_name,plan_id,payment_amount_cents,commission_cents,status,created_at,partner:referral_partners!inner(full_name,email,code)",
        )
        .eq("trader_id", workspace.traderId)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };

  const commissions: MentorReferralCommission[] = (data ?? []).map((row) => {
    const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
    return {
      id: row.id,
      student_name: row.student_name,
      plan_id: row.plan_id,
      payment_amount_cents: row.payment_amount_cents,
      commission_cents: row.commission_cents,
      status: row.status,
      created_at: row.created_at,
      partner_name: partner?.full_name ?? "",
      partner_email: partner?.email ?? "",
      code: partner?.code ?? "",
    };
  });

  return (
    <DashboardShell
      activePath="/dashboard/referrals"
      description="10% of each referred student’s subscription payment, including renewals."
      portalName={workspace.portal.portal_name}
      portalSlug={workspace.portal.slug}
      title="Referrals"
      traderId={workspace.traderId}
      userLabel={workspace.displayName}
    >
      <MentorReferrals commissions={commissions} />
    </DashboardShell>
  );
}
