"use client";

import { useState } from "react";
import { OwnerEmailChangeForm } from "@/components/owner-email-change-form";
import { TeamManager } from "@/components/team-manager";

interface Props {
  callerRole: string;
  callerUserId: string;
  currentEmail: string;
  invitations: { id: string; email: string; created_at: string }[];
  members: { user_id: string; role: string; created_at: string }[];
  profiles: { id: string; full_name: string | null }[];
}

const TABS = ["Account", "Team"] as const;
type Tab = (typeof TABS)[number];

export function SettingsTabs({
  callerRole,
  callerUserId,
  currentEmail,
  invitations,
  members,
  profiles,
}: Props) {
  const [tab, setTab] = useState<Tab>("Account");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid #e5e7eb",
          marginBottom: 28,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #111315" : "2px solid transparent",
              color: tab === t ? "#111315" : "#6b7280",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Account" &&
        (callerRole === "owner" && currentEmail ? (
          <OwnerEmailChangeForm currentEmail={currentEmail} />
        ) : (
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Only the workspace owner can change the account email.
          </p>
        ))}

      {tab === "Team" && (
        <TeamManager
          callerRole={callerRole as "owner" | "mentor"}
          callerUserId={callerUserId}
          invitations={invitations}
          members={
            members as { user_id: string; role: "owner" | "mentor"; created_at: string }[]
          }
          profiles={profiles}
        />
      )}
    </div>
  );
}
