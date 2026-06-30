"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./team-manager.module.css";

interface Member {
  user_id: string;
  role: "owner" | "mentor";
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
}

interface PendingInvitation {
  id: string;
  email: string;
  created_at: string;
}

interface Props {
  members: Member[];
  profiles: Profile[];
  invitations: PendingInvitation[];
  callerUserId: string;
  callerRole: "owner" | "mentor";
}

function getDisplayName(member: Member, profiles: Profile[]): string {
  const profile = profiles.find((p) => p.id === member.user_id);
  return profile?.full_name || member.user_id.slice(0, 8) + "…";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TeamManager({
  members,
  profiles,
  invitations,
  callerUserId,
  callerRole,
}: Props) {
  const router = useRouter();
  const isOwner = callerRole === "owner";

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<Record<string, string>>({});

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<Record<string, string>>({});

  async function sendInvite() {
    if (!email.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const res = await fetch("/api/workspace/mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json()) as { error?: string; invited?: boolean; added?: boolean };
      if (!res.ok) {
        setInviteError(body.error ?? "Could not send invitation.");
        return;
      }
      const msg = body.invited
        ? `Invitation sent to ${email.trim()}.`
        : `${email.trim()} has been added to your workspace.`;
      setInviteSuccess(msg);
      setEmail("");
      router.refresh();
      setTimeout(() => setInviteSuccess(null), 4000);
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(userId: string) {
    setRemovingId(userId);
    setRemoveError((prev) => ({ ...prev, [userId]: "" }));
    try {
      const res = await fetch(`/api/workspace/mentors/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setRemoveError((prev) => ({ ...prev, [userId]: body.error ?? "Could not remove." }));
        return;
      }
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  async function cancelInvitation(id: string) {
    setCancellingId(id);
    setCancelError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/workspace/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setCancelError((prev) => ({ ...prev, [id]: body.error ?? "Could not cancel." }));
        return;
      }
      router.refresh();
    } finally {
      setCancellingId(null);
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

      {/* Pending invitations (owner only) */}
      {isOwner && invitations.length > 0 ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Pending invitations</p>
          <div className={styles.memberList}>
            {invitations.map((inv) => (
              <div className={styles.memberRow} key={inv.id}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{inv.email}</span>
                  <span className={styles.pendingBadge}>Sent {formatDate(inv.created_at)}</span>
                </div>
                <div className={styles.memberActions}>
                  {cancelError[inv.id] ? (
                    <span className={styles.inlineError}>{cancelError[inv.id]}</span>
                  ) : null}
                  <button
                    className={styles.removeBtn}
                    disabled={cancellingId === inv.id}
                    onClick={() => cancelInvitation(inv.id)}
                    type="button"
                  >
                    {cancellingId === inv.id ? "Cancelling…" : "Cancel"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Invite a mentor (owner only) */}
      {isOwner ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Invite a mentor</p>
          <div className={styles.inviteForm}>
            <input
              className={styles.emailInput}
              disabled={inviting}
              onChange={(e) => {
                setEmail(e.target.value);
                setInviteError(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") void sendInvite(); }}
              placeholder="Email address"
              type="email"
              value={email}
            />
            <button
              className={styles.inviteBtn}
              disabled={inviting || !email.trim()}
              onClick={() => void sendInvite()}
              type="button"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
          {inviteError ? <p className={styles.errorMsg}>{inviteError}</p> : null}
          {inviteSuccess ? <p className={styles.successMsg}>{inviteSuccess}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
