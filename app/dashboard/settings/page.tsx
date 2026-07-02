import { redirect }               from "next/navigation";
import { DashboardShell }         from "@/components/dashboard-shell";
import { SettingsTabs }           from "@/components/settings-tabs";
import { OwnerEmailChangeForm }   from "@/components/owner-email-change-form";
import { TeamManager }            from "@/components/team-manager";
import { BrokerAccountsManager }  from "@/components/broker-accounts-manager";
import { PortalBrandingForm }     from "@/components/portal-branding-form";
import type { VerificationMethod } from "@/lib/database.types";
import { getMentorWorkspace }     from "@/lib/workspace";

export const dynamic = "force-dynamic";

type SettingsTab = "account" | "team" | "brokers" | "branding" | "audit-logs";
const VALID_TABS = new Set<string>(["account", "team", "brokers", "branding", "audit-logs"]);

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName, user, portal } = workspace;

  const rawTab = (await searchParams)?.tab ?? "account";
  const tab: SettingsTab = VALID_TABS.has(rawTab) ? (rawTab as SettingsTab) : "account";

  // ── Account tab ───────────────────────────────────────────────────────────
  if (tab === "account") {
    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
      >
        <SettingsTabs activeTab="account" />
        <OwnerEmailChangeForm currentEmail={user.email ?? ""} />
      </DashboardShell>
    );
  }

  // ── Team tab ──────────────────────────────────────────────────────────────
  if (tab === "team") {
    const { data: membership } = await supabase
      .from("trader_members")
      .select("role")
      .eq("trader_id", traderId)
      .eq("user_id", user.id)
      .maybeSingle();

    const [{ data: members }, { data: invitations }] = await Promise.all([
      supabase
        .from("trader_members")
        .select("user_id, role, created_at")
        .eq("trader_id", traderId)
        .order("created_at"),
      supabase
        .from("workspace_invitations")
        .select("id, email, created_at")
        .eq("trader_id", traderId)
        .is("accepted_at", null)
        .order("created_at"),
    ]);

    const memberUserIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = memberUserIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
      : { data: [] };

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
      >
        <SettingsTabs activeTab="team" />
        <TeamManager
          callerRole={membership?.role ?? "mentor"}
          callerUserId={user.id}
          invitations={invitations ?? []}
          members={members ?? []}
          profiles={profiles ?? []}
        />
      </DashboardShell>
    );
  }

  // ── Brokers tab ───────────────────────────────────────────────────────────
  if (tab === "brokers") {
    const { data } = await supabase
      .from("trader_broker_accounts")
      .select(
        "id,partner_code,affiliate_link,verification_method,verification_instructions,is_active,broker:brokers(name)",
      )
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false });

    const accounts = (data ?? []).map((account) => ({
      ...account,
      verification_method: account.verification_method as VerificationMethod,
      verification_instructions:
        (account as { verification_instructions?: string | null })
          .verification_instructions ?? null,
      broker: Array.isArray(account.broker)
        ? account.broker[0] ?? null
        : account.broker,
    }));

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
      >
        <SettingsTabs activeTab="brokers" />
        <BrokerAccountsManager accounts={accounts} />
      </DashboardShell>
    );
  }

  // ── Branding tab ──────────────────────────────────────────────────────────
  if (tab === "branding") {
    const [{ data: portalData }, { data: riskTemplates }] = await Promise.all([
      supabase.from("portals").select("*").eq("id", portal.id).single(),
      supabase
        .from("risk_disclosure_templates")
        .select("id,title,message")
        .eq("is_active", true)
        .order("title"),
    ]);

    if (!portalData) redirect("/dashboard/settings");

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
      >
        <SettingsTabs activeTab="branding" />
        <PortalBrandingForm
          initialPortal={portalData}
          riskTemplates={riskTemplates ?? []}
          websiteDeliveryMode={portalData.website_delivery_mode ?? "core_page"}
        />
      </DashboardShell>
    );
  }

  // ── Audit logs tab ────────────────────────────────────────────────────────
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id,action,entity_type,entity_id,actor_role,created_at")
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <DashboardShell
      activePath="/dashboard/settings"
      description="Manage workspace security, identity, and team members."
      title="Settings"
      userLabel={displayName}
      traderId={traderId}
    >
      <SettingsTabs activeTab="audit-logs" />
      <AuditLogsPanel logs={logs ?? []} />
    </DashboardShell>
  );
}

// ── Inline audit log panel ────────────────────────────────────────────────
function AuditLogsPanel({
  logs,
}: {
  logs: {
    id: number;
    action: string;
    entity_type: string;
    entity_id: string | null;
    actor_role: string | null;
    created_at: string;
  }[];
}) {
  return (
    <section>
      <header style={{ marginBottom: "1.25rem" }}>
        <p className="eyebrow">Governance</p>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
          Workspace audit log
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Latest 200 changes in your workspace.
        </p>
      </header>
      {logs.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>No audit entries yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Action</th>
                <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Entity</th>
                <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>ID</th>
                <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.55rem 0.75rem", whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.55rem 0.75rem" }}>
                    <span style={{
                      background: "var(--surface-hover, #f3f4f6)",
                      borderRadius: "999px",
                      padding: "0.15rem 0.55rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "0.55rem 0.75rem" }}>{log.entity_type}</td>
                  <td style={{ padding: "0.55rem 0.75rem", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {log.entity_id ?? "—"}
                  </td>
                  <td style={{ padding: "0.55rem 0.75rem", color: "var(--text-muted)" }}>
                    {log.actor_role ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
