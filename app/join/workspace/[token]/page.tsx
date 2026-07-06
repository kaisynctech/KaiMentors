import type { Metadata }          from "next";
import { notFound }               from "next/navigation";
import { createAdminClient }      from "@/lib/supabase/admin";
import { JoinWorkspaceForm }      from "@/components/join-workspace-form";
import { portalTitle }            from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return portalTitle("Workspace invitation");

  const { data: trader } = await admin
    .from("traders")
    .select("id")
    .eq("invite_token", token)
    .maybeSingle();
  if (!trader) return portalTitle("Workspace invitation");

  const { data: portalRow } = await admin
    .from("portals")
    .select("portal_name")
    .eq("trader_id", trader.id)
    .maybeSingle();

  const name = portalRow?.portal_name ?? "Workspace";
  return portalTitle(`Join ${name}`);
}

export default async function JoinWorkspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: trader } = await admin
    .from("traders")
    .select("id")
    .eq("invite_token", token)
    .maybeSingle();

  if (!trader) notFound();

  const { data: portalRow } = await admin
    .from("portals")
    .select("portal_name")
    .eq("trader_id", trader.id)
    .maybeSingle();

  const workspaceName = portalRow?.portal_name ?? "the workspace";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <JoinWorkspaceForm
        workspaceToken={token}
        workspaceName={workspaceName}
      />
    </div>
  );
}
