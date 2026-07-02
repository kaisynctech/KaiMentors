import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { JoinForm } from "@/components/join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at, created_at, invited_by")
    .eq("id", token)
    .maybeSingle();

  if (!invitation) notFound();

  if (invitation.accepted_at) {
    return (
      <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "80px auto", padding: "0 24px" }}>
        <h1 style={{ fontWeight: 800, fontSize: "1.4rem" }}>Invitation already used</h1>
        <p style={{ color: "#6b7280" }}>
          This invitation has already been accepted. If you have an account, please{" "}
          <a href="/login" style={{ color: "#111314", fontWeight: 700 }}>sign in</a>.
        </p>
      </div>
    );
  }

  const createdAt = new Date(invitation.created_at);
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (new Date() > expiresAt) {
    return (
      <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "80px auto", padding: "0 24px" }}>
        <h1 style={{ fontWeight: 800, fontSize: "1.4rem" }}>Invitation expired</h1>
        <p style={{ color: "#6b7280" }}>
          This invitation link expired after 7 days. Please ask the workspace owner to send a new one.
        </p>
      </div>
    );
  }

  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    admin
      .from("portals")
      .select("portal_name")
      .eq("trader_id", invitation.trader_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", invitation.invited_by)
      .maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "your workspace";
  const inviterName = inviterProfile?.full_name ?? "Your colleague";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f3f4f6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <JoinForm
        email={invitation.email}
        invitationId={invitation.id}
        inviterName={inviterName}
        workspaceName={workspaceName}
      />
    </div>
  );
}
