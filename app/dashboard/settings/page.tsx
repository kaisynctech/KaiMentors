import { redirect }               from "next/navigation";
import { headers }                from "next/headers";
import { DashboardShell }         from "@/components/dashboard-shell";
import { SettingsTabs }           from "@/components/settings-tabs";
import { OwnerEmailChangeForm }   from "@/components/owner-email-change-form";
import { TeamManager }            from "@/components/team-manager";
import { BrokerAccountsManager }  from "@/components/broker-accounts-manager";
import { PortalBrandingForm }     from "@/components/portal-branding-form";
import { MentorBillingPanel }     from "@/components/mentor-billing-panel";
import type { VerificationMethod } from "@/lib/database.types";
import { getSubscriptionSummary } from "@/lib/entitlements";
import { getMentorWorkspace }     from "@/lib/workspace";
import { createAdminClient }      from "@/lib/supabase/admin";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";

export const dynamic = "force-dynamic";

type SettingsTab = "account" | "team" | "brokers" | "branding" | "billing" | "audit-logs";
const VALID_TABS = new Set<string>(["account", "team", "brokers", "branding", "billing", "audit-logs"]);

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
        portalName={portal.portal_name}
        portalSlug={portal.slug}
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

    const admin = createAdminClient();

    const [{ data: members }, { data: traderRow }] = await Promise.all([
      supabase
        .from("trader_members")
        .select("user_id, role, created_at")
        .eq("trader_id", traderId)
        .order("created_at"),
      admin
        ? admin.from("traders").select("invite_token").eq("id", traderId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const memberUserIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = memberUserIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", memberUserIds)
      : { data: [] };

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
        portalName={portal.portal_name}
        portalSlug={portal.slug}
      >
        <SettingsTabs activeTab="team" />
        <TeamManager
          callerRole={membership?.role ?? "mentor"}
          callerUserId={user.id}
          inviteToken={(traderRow as { invite_token?: string | null } | null)?.invite_token ?? null}
          members={members ?? []}
          profiles={profiles ?? []}
          traderId={traderId}
        />
      </DashboardShell>
    );
  }

  // ── Brokers tab ───────────────────────────────────────────────────────────
  if (tab === "brokers") {
    const { data } = await supabase
      .from("trader_broker_accounts")
      .select(
        "id,partner_code,affiliate_link,verification_method,verification_instructions,is_active,new_account_instructions,new_account_image_path,new_account_video_path,existing_account_instructions,existing_account_image_path,existing_account_video_path,broker:brokers(name)",
      )
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false });

    const admin = createAdminClient();
    async function signMedia(path: string | null): Promise<string | null> {
      if (!path || !admin) return null;
      const { data: signed } = await admin.storage
        .from("academy-media")
        .createSignedUrl(path, 3600);
      return signed?.signedUrl ?? null;
    }

    const accounts = await Promise.all(
      (data ?? []).map(async (account) => {
        const raw = account as unknown as Record<string, unknown>;
        return {
          ...account,
          verification_method: account.verification_method as VerificationMethod,
          verification_instructions:
            (raw.verification_instructions as string | null) ?? null,
          broker: Array.isArray(account.broker)
            ? account.broker[0] ?? null
            : account.broker,
          new_account_instructions: (raw.new_account_instructions as string | null) ?? null,
          new_account_image_path: (raw.new_account_image_path as string | null) ?? null,
          new_account_video_path: (raw.new_account_video_path as string | null) ?? null,
          existing_account_instructions: (raw.existing_account_instructions as string | null) ?? null,
          existing_account_image_path: (raw.existing_account_image_path as string | null) ?? null,
          existing_account_video_path: (raw.existing_account_video_path as string | null) ?? null,
          new_account_image_url: await signMedia((raw.new_account_image_path as string | null) ?? null),
          new_account_video_url: await signMedia((raw.new_account_video_path as string | null) ?? null),
          existing_account_image_url: await signMedia((raw.existing_account_image_path as string | null) ?? null),
          existing_account_video_url: await signMedia((raw.existing_account_video_path as string | null) ?? null),
        };
      }),
    );

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
        portalName={portal.portal_name}
        portalSlug={portal.slug}
      >
        <SettingsTabs activeTab="brokers" />
        <BrokerAccountsManager accounts={accounts} />
      </DashboardShell>
    );
  }

  // ── Branding tab ──────────────────────────────────────────────────────────
  if (tab === "branding") {
    const headersList = await headers();
    const currentHostname = normalizeRequestHostname(
      headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "",
    );
    const currentRequestHostname =
      currentHostname && !isPlatformHostname(currentHostname)
        ? currentHostname
        : null;

    const [{ data: portalData }, { data: riskTemplates }, { data: primaryDomain }] =
      await Promise.all([
        supabase.from("portals").select("*").eq("id", portal.id).single(),
        supabase
          .from("risk_disclosure_templates")
          .select("id,title,message")
          .eq("is_active", true)
          .order("title"),
        supabase
          .from("website_domains")
          .select("hostname")
          .eq("trader_id", traderId)
          .eq("status", "active")
          .eq("is_primary", true)
          .maybeSingle(),
      ]);

    if (!portalData) redirect("/dashboard/settings");

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
        portalName={portal.portal_name}
        portalSlug={portal.slug}
      >
        <SettingsTabs activeTab="branding" />
        <PortalBrandingForm
          currentRequestHostname={currentRequestHostname}
          initialPortal={portalData}
          isCustomDomainContext={workspace.customDomain === true}
          primarySiteHostname={primaryDomain?.hostname ?? null}
          riskTemplates={riskTemplates ?? []}
          websiteDeliveryMode={portalData.website_delivery_mode ?? "core_page"}
        />
      </DashboardShell>
    );
  }

  // ── Billing tab ───────────────────────────────────────────────────────────
  if (tab === "billing") {
    const summary = await getSubscriptionSummary(traderId);
    const eftInstructions = process.env.KAIMENTORS_BILLING_EFT_INSTRUCTIONS?.trim() || null;

    return (
      <DashboardShell
        activePath="/dashboard/settings"
        description="Manage workspace security, identity, and team members."
        title="Settings"
        userLabel={displayName}
        traderId={traderId}
        portalName={portal.portal_name}
        portalSlug={portal.slug}
      >
        <SettingsTabs activeTab="billing" />
        {summary ? (
          <MentorBillingPanel eftInstructions={eftInstructions} summary={summary} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Subscription details are not available yet.</p>
        )}
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
