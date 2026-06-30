import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const query = await searchParams;
  const invitationId = query?.id;

  if (!invitationId) redirect("/");

  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/invite/accept?id=${invitationId}`);
  }

  const admin = createAdminClient();
  if (!admin) redirect("/dashboard");

  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, trader_id, email, accepted_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invitation) redirect("/dashboard");
  if (invitation.accepted_at) redirect("/dashboard");

  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 480 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Wrong account</h1>
        <p style={{ color: "#6b7280" }}>
          This invitation was sent to <strong>{invitation.email}</strong>. You are logged in
          as <strong>{user.email}</strong>. Please sign in with the correct account and try
          again.
        </p>
      </div>
    );
  }

  await admin
    .from("trader_members")
    .upsert(
      { trader_id: invitation.trader_id, user_id: user.id, role: "mentor" },
      { onConflict: "trader_id,user_id", ignoreDuplicates: true },
    );

  await admin
    .from("workspace_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitationId);

  redirect("/dashboard");
}
