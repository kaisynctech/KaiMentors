import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountSetupState =
  | "new_identity"
  | "unverified_identity"
  | "active_invitation"
  | "expired_invitation"
  | "verified_awaiting_password"
  | "completed_account"
  | "role_conflict"
  | "email_correction"
  | "inconsistent_state";

export function hashAccountSetupValue(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function createAccountSetupToken() {
  return randomBytes(32).toString("base64url");
}

export async function resolveAccountSetupState(admin: SupabaseClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,role")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  if (!profile) return { state: "new_identity" as const, userId: null, invitation: null, academyName: null };

  const [{ data: authIdentity }, { data: invitations }, { data: membership }, { data: application }, { data: correction }] = await Promise.all([
    admin.auth.admin.getUserById(profile.id),
    admin
      .from("academy_invitations")
      .select("id,email,status,expires_at,trader_id,invited_user_id,display_name")
      .eq("invited_user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1),
    admin.from("trader_members").select("id,role,trader_id,trader:traders(display_name)").eq("user_id", profile.id).limit(2),
    admin.from("student_applications").select("id,trader_id,portal:portals(portal_name)").eq("student_user_id", profile.id).limit(1),
    admin.from("academy_owner_email_corrections").select("id,status").eq("user_id", profile.id).eq("status", "pending_verification").limit(1).maybeSingle(),
  ]);
  const invitation = invitations?.[0] ?? null;
  const memberTrader = membership?.[0]?.trader as unknown as { display_name: string } | Array<{ display_name: string }> | null | undefined;
  const applicationPortal = application?.[0]?.portal as unknown as { portal_name: string } | Array<{ portal_name: string }> | null | undefined;
  const academyName = invitation?.display_name
    ?? (Array.isArray(memberTrader) ? memberTrader[0]?.display_name : memberTrader?.display_name)
    ?? (Array.isArray(applicationPortal) ? applicationPortal[0]?.portal_name : applicationPortal?.portal_name)
    ?? null;
  const user = authIdentity.user;
  if (!user || user.email?.toLowerCase() !== normalizedEmail) {
    return { state: "inconsistent_state" as const, userId: profile.id, invitation, academyName };
  }
  if (correction) {
    return { state: "email_correction" as const, userId: profile.id, invitation, academyName };
  }
  if (invitation && profile.role !== "trader") {
    return { state: "role_conflict" as const, userId: profile.id, invitation, academyName };
  }
  if (invitation?.status === "pending") {
    const state = new Date(invitation.expires_at).getTime() > Date.now()
      ? "active_invitation"
      : "expired_invitation";
    return { state, userId: profile.id, invitation, academyName } as const;
  }
  if (invitation?.status === "expired") {
    return { state: "expired_invitation" as const, userId: profile.id, invitation, academyName };
  }
  if (!user.email_confirmed_at) {
    return { state: "unverified_identity" as const, userId: profile.id, invitation, academyName };
  }
  if (profile.role === "trader" && (!membership || membership.length !== 1)) {
    return { state: "inconsistent_state" as const, userId: profile.id, invitation, academyName };
  }
  if (profile.role === "student" && !application?.length) {
    return { state: "inconsistent_state" as const, userId: profile.id, invitation, academyName };
  }
  return { state: "completed_account" as const, userId: profile.id, invitation, academyName };
}
