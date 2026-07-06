"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./team-manager.module.css";

const SITE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://kaimentors.vercel.app";

interface Member {
  user_id: string;
  role: "owner" | "mentor";
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email?: string | null;
}

interface Props {
  members: Member[];
  profiles: Profile[];
  callerUserId: string;
  callerRole: "owner" | "mentor";
  traderId: string;
  inviteToken?: string | null;
}

function getDisplayName(member: Member, profiles: Profile[]): string {
  const profile = profiles.find((p) => p.id === member.user_id);
  return profile?.full_name || profile?.email || member.user_id.slice(0, 8) + "…";
}

export function TeamManager({
  members,
  profiles,
  callerUserId,
  callerRole,
  traderId,
  inviteToken,
}: Props) {
  const router = useRouter();
  const isOwner = callerRole === "owner";

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<Record<string, string>>({});

  const [currentInviteToken, setCurrentInviteToken] = useState(inviteToken ?? null);
  const [workspaceLinkCopied, setWorkspaceLinkCopied] = useState(false);
  const [resettingToken, setResettingToken]           = useState(false);
  const [resetTokenError, setResetTokenError]         = useState<string | null>(null);

  const workspaceJoinLink = currentInviteToken
    ? `${SITE_URL}/join/workspace/${currentInviteToken}`
    : null;

  async function removeMember(userId: string) {
    setRemovingId(userId);
    setRemoveError((prev) => ({ ...prev, [userId]: "" }));
    try {
      const res = await fetch(`/api/workspace/mentors/${userId}?traderId=${traderId}`, { method: "DELETE", signal: AbortSignal.timeout(12000) });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setRemoveError((prev) => ({ ...prev, [userId]: body.error ?? "Could not remove." }));
        return;
      }
      router.refresh();
    } catch {
      setRemoveError((prev) => ({ ...prev, [userId]: "Request timed out. Please try again." }));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={styles.container}>
      {/* Current team */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Current team</p>
        <div className={styles.memberList}>
          {members.map((m) => (
            <div className={styles.memberRow} key={m.user_id}>
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{getDisplayName(m, profiles)}</span>
                <span
                  className={`${styles.roleBadge} ${m.role === "owner" ? styles.roleBadgeOwner : styles.roleBadgeMentor}`}
                >
                  {m.role === "owner" ? "Owner" : "Mentor"}
                </span>
              </div>
              <div className={styles.memberActions}>
                {isOwner && m.user_id !== callerUserId ? (
                  <>
                    {removeError[m.user_id] ? (
                      <span className={styles.inlineError}>{removeError[m.user_id]}</span>
                    ) : null}
                    <button
                      className={styles.removeBtn}
                      disabled={removingId === m.user_id}
                      onClick={() => removeMember(m.user_id)}
                      type="button"
                    >
                      {removingId === m.user_id ? "Removing…" : "Remove"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workspace invite link (owner only) */}
      {isOwner && workspaceJoinLink ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Workspace invite link</p>
          <div style={{ padding: "14px 20px 16px" }}>
            <p style={{
              fontSize: "0.82rem",
              color: "#6b7280",
              margin: "0 0 10px",
              lineHeight: "1.5",
            }}>
              Share this link with anyone you want to add as a mentor. They set up
              their own account — no email invitation needed.
            </p>
            <div className={styles.linkBox} style={{ margin: "0 0 10px" }}>
              <span className={styles.linkText}>{workspaceJoinLink}</span>
              <button
                className={styles.copyBtn}
                onClick={async () => {
                  await navigator.clipboard.writeText(workspaceJoinLink);
                  setWorkspaceLinkCopied(true);
                  setTimeout(() => setWorkspaceLinkCopied(false), 2000);
                }}
                type="button"
              >
                {workspaceLinkCopied ? "Copied!" : "Copy link"}
              </button>
            </div>
            {resetTokenError ? (
              <p className={styles.errorMsg} style={{ margin: "0 0 6px" }}>
                {resetTokenError}
              </p>
            ) : null}
            <button
              className={styles.resendBtn}
              disabled={resettingToken}
              onClick={async () => {
                setResettingToken(true);
                setResetTokenError(null);
                try {
                  const res = await fetch("/api/workspace/invite-token", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ traderId }),
                    signal: AbortSignal.timeout(12000),
                  });
                  const body = (await res.json()) as {
                    inviteToken?: string;
                    error?: string;
                  };
                  if (!res.ok) {
                    setResetTokenError(body.error ?? "Could not reset link.");
                    return;
                  }
                  if (body.inviteToken) {
                    setCurrentInviteToken(body.inviteToken);
                  }
                } catch {
                  setResetTokenError("Request timed out. Please try again.");
                } finally {
                  setResettingToken(false);
                }
              }}
              style={{ fontSize: "0.75rem" }}
              type="button"
            >
              {resettingToken ? "Resetting…" : "Reset link"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
