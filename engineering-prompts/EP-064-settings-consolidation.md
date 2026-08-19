# EP-064 — Settings Consolidation

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Remove **Broker accounts**, **Academy Page**, and **Audit logs** from the main dashboard nav and surface them as tabs inside Settings. The sidebar shrinks from 13 items to 10. Existing routes for Brokers and Branding become redirects. The Audit logs dead link is resolved by the new Settings tab.

No schema changes. No new API routes.

---

## Scope

| File | Change |
|---|---|
| `components/dashboard-shell.tsx` | Remove 3 nav items + their icon imports |
| `components/settings-tabs.tsx` | Replace `useState` tab nav with URL-driven Link nav (same pattern as `CoursesTabs`) |
| `components/settings-tabs.module.css` | Update tab styles to Link-compatible (remove button-specific styles) |
| `app/dashboard/settings/page.tsx` | URL-driven tabs; conditional data fetching per tab; render sub-content per tab |
| `app/dashboard/brokers/page.tsx` | Replace with redirect to `/dashboard/settings?tab=brokers` |
| `app/dashboard/branding/page.tsx` | Replace with redirect to `/dashboard/settings?tab=branding` |
| `app/dashboard/audit-logs/page.tsx` | **Create** — redirect to `/dashboard/settings?tab=audit-logs` (resolves dead nav link) |

---

## 1 — Dashboard shell: remove 3 nav items

**File:** `components/dashboard-shell.tsx`

Remove these three rows from `traderNavigation`:

```typescript
// DELETE:
["Broker accounts", "/dashboard/brokers",    Building2],
["Academy Page",    "/dashboard/branding",   WandSparkles],
["Audit logs",      "/dashboard/audit-logs", ScrollText],
```

Remove the three now-unused icon imports (`Building2`, `WandSparkles`, `ScrollText`). Verify none of these are used elsewhere in the file before removing.

After the change `traderNavigation` has 10 items: Overview, Students, Student Groups, Messages, Community, Courses, Resources, Live classes, Bookings, Settings.

---

## 2 — SettingsTabs: convert to URL-driven tab nav

**File:** `components/settings-tabs.tsx`

Replace the entire file. The component now only renders the tab navigation bar — it no longer manages content or `useState`. Content is rendered by the server page below this component.

```typescript
"use client";

import Link from "next/link";
import styles from "./settings-tabs.module.css";

const TABS = [
  { value: "account",    label: "Account"         },
  { value: "team",       label: "Team"             },
  { value: "brokers",    label: "Broker Accounts"  },
  { value: "branding",   label: "Academy Page"     },
  { value: "audit-logs", label: "Audit Logs"       },
] as const;

type TabValue = (typeof TABS)[number]["value"];

interface Props {
  activeTab: TabValue;
}

export function SettingsTabs({ activeTab }: Props) {
  return (
    <div className={styles.tabs}>
      {TABS.map((t) => (
        <Link
          key={t.value}
          href={t.value === "account" ? "/dashboard/settings" : `/dashboard/settings?tab=${t.value}`}
          className={`${styles.tab} ${activeTab === t.value ? styles.tabActive : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
```

**File:** `components/settings-tabs.module.css`

Replace the entire file with link-compatible styles that match the existing tab style used across the app:

```css
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.tab {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: var(--text-primary); }

.tabActive {
  color: var(--text-primary);
  border-bottom-color: #111314;
}
```

---

## 3 — Settings page: URL-driven, conditional data fetching

**File:** `app/dashboard/settings/page.tsx`

Replace the entire file:

```typescript
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

// ── Inline audit log panel (no separate component needed) ─────────────────
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
```

---

## 4 — Old pages become redirects

**File:** `app/dashboard/brokers/page.tsx` — replace entire file:

```typescript
import { redirect } from "next/navigation";
export default function BrokerAccountsRedirect() {
  redirect("/dashboard/settings?tab=brokers");
}
```

**File:** `app/dashboard/branding/page.tsx` — replace entire file:

```typescript
import { redirect } from "next/navigation";
export default function BrandingRedirect() {
  redirect("/dashboard/settings?tab=branding");
}
```

**File:** `app/dashboard/audit-logs/page.tsx` — create new file:

```typescript
import { redirect } from "next/navigation";
export default function AuditLogsRedirect() {
  redirect("/dashboard/settings?tab=audit-logs");
}
```

This file resolves the dead nav link. After the nav change, this file is unreachable from the UI but should still exist for any direct bookmarks.

---

## 5 — Commit and deploy

No migration. Run:

```bash
git add -A
git commit -m "feat: EP-064 broker accounts, academy page, audit logs consolidated under settings"
git push origin main && vercel --prod
```

---

## 6 — Acceptance Criteria

- [ ] Dashboard sidebar shows exactly 10 items: Overview, Students, Student Groups, Messages, Community, Courses, Resources, Live classes, Bookings, Settings
- [ ] `Building2`, `WandSparkles`, `ScrollText` icon imports removed from `dashboard-shell.tsx` — TypeScript compiles clean
- [ ] `/dashboard/settings` (no param) → Account tab active, `OwnerEmailChangeForm` renders
- [ ] `/dashboard/settings?tab=team` → Team tab active, `TeamManager` renders
- [ ] `/dashboard/settings?tab=brokers` → Broker Accounts tab active, `BrokerAccountsManager` renders
- [ ] `/dashboard/settings?tab=branding` → Academy Page tab active, `PortalBrandingForm` renders
- [ ] `/dashboard/settings?tab=audit-logs` → Audit Logs tab active, table of latest 200 entries for KaiTrades workspace renders
- [ ] Navigating to `/dashboard/brokers` redirects to `/dashboard/settings?tab=brokers`
- [ ] Navigating to `/dashboard/branding` redirects to `/dashboard/settings?tab=branding`
- [ ] Navigating to `/dashboard/audit-logs` redirects to `/dashboard/settings?tab=audit-logs`
- [ ] Active tab has `#111314` underline; inactive tabs are muted — matches rest of app
- [ ] Tab bar wraps gracefully on narrow viewports (`flex-wrap: wrap` on `.tabs`)
