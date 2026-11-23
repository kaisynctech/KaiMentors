import type { SupabaseClient } from "@supabase/supabase-js";
import { isPortalFeatureEnabled, type PortalAccessModel } from "@/lib/portal-features";
import {
  generateReferralCode,
  normalizeReferralCode,
  referralCommissionCents,
} from "@/lib/referral-math";

export interface ReferralPortal {
  id: string;
  trader_id: string;
  slug: string;
  portal_name: string;
  access_model: PortalAccessModel;
  student_portal_features: Record<string, boolean> | null;
}

type AdminClient = SupabaseClient;

export function referralsEnabled(portal: {
  access_model: PortalAccessModel;
  student_portal_features: Record<string, boolean> | null;
}) {
  return isPortalFeatureEnabled(
    portal.student_portal_features,
    "referrals",
    portal.access_model,
  );
}

export async function loadReferralPortal(admin: AdminClient, slug: string) {
  const { data } = await admin
    .from("portals")
    .select(
      "id,trader_id,slug,portal_name,access_model,student_portal_features,is_published",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  if (!data || !referralsEnabled(data as ReferralPortal)) return null;
  return data as ReferralPortal;
}

export const AFFILIATE_TERMS_VERSION = "2026-11-23";

export class ReferralDuplicateError extends Error {
  constructor(message = "That phone number is already linked to an affiliate account.") {
    super(message);
  }
}

/** Keeps "+" and digits only. Numbers without a country code are treated as South African. */
export function normalizeAffiliatePhone(raw: string | null | undefined) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) e164 = `+27${digits.slice(1)}`;
  else e164 = `+${digits}`;
  return /^\+[0-9]{7,15}$/.test(e164) ? e164 : null;
}

export async function findPartnerByUser(
  admin: AdminClient,
  portalId: string,
  userId: string,
) {
  const { data } = await admin
    .from("referral_partners")
    .select("id,code,full_name,email,user_id,portal_id,trader_id")
    .eq("portal_id", portalId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function createReferralPartner(
  admin: AdminClient,
  portal: ReferralPortal,
  input: {
    userId: string;
    fullName: string;
    email: string;
    phone?: string | null;
    country?: string | null;
    promoChannel?: string | null;
    promoLink?: string | null;
    termsVersion?: string | null;
  },
) {
  const existing = await findPartnerByUser(admin, portal.id, input.userId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    const { data, error } = await admin
      .from("referral_partners")
      .insert({
        trader_id: portal.trader_id,
        portal_id: portal.id,
        user_id: input.userId,
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        code,
        phone: input.phone ?? null,
        country: input.country ?? null,
        promo_channel: input.promoChannel ?? null,
        promo_link: input.promoLink ?? null,
        terms_version: input.termsVersion ?? null,
        terms_accepted_at: input.termsVersion ? new Date().toISOString() : null,
        status: "active",
      })
      .select("id,code,full_name,email,user_id,portal_id,trader_id")
      .single();
    if (!error && data) return data;
    if (error?.code !== "23505") {
      throw new Error("The referral code could not be created.");
    }
    // A unique clash on phone or user is not a code clash: stop retrying.
    if (error.message.includes("phone")) throw new ReferralDuplicateError();
    if (error.message.includes("user_id") || error.message.includes("email")) {
      const again = await findPartnerByUser(admin, portal.id, input.userId);
      if (again) return again;
      throw new ReferralDuplicateError("That email is already linked to an affiliate account.");
    }
  }
  throw new Error("The referral code could not be created.");
}

export async function resolveReferralPartner(
  admin: AdminClient,
  portal: ReferralPortal,
  rawCode: string | null | undefined,
  studentEmail: string,
) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: true as const, partner: null };
  const { data: partner } = await admin
    .from("referral_partners")
    .select("id,user_id,email,code,status")
    .eq("portal_id", portal.id)
    .eq("code", code)
    .maybeSingle();
  if (!partner || partner.status === "suspended") {
    return { ok: false as const, error: "That referral code is not valid." };
  }
  if (partner.email.toLowerCase() === studentEmail.trim().toLowerCase()) {
    return { ok: false as const, error: "You cannot use your own referral code." };
  }
  return { ok: true as const, partner };
}

export async function attachReferralAttribution(
  admin: AdminClient,
  portal: ReferralPortal,
  input: {
    partnerId: string;
    applicationId: string;
    studentUserId: string;
    code: string;
  },
) {
  const { data: existing } = await admin
    .from("referral_attributions")
    .select("id")
    .eq("student_application_id", input.applicationId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("referral_attributions").insert({
    trader_id: portal.trader_id,
    portal_id: portal.id,
    referral_partner_id: input.partnerId,
    student_application_id: input.applicationId,
    student_user_id: input.studentUserId,
    code: input.code,
  });
  if (error && error.code !== "23505") {
    throw new Error("The referral could not be saved.");
  }
}

export async function recordReferralCommission(
  admin: AdminClient,
  subscription: {
    id: string;
    student_application_id: string;
    amount_cents: number;
    plan_id: string;
  },
  payfastPaymentId: string | null | undefined,
) {
  if (!payfastPaymentId) return;

  const { data: attribution } = await admin
    .from("referral_attributions")
    .select("id,referral_partner_id,trader_id,portal_id")
    .eq("student_application_id", subscription.student_application_id)
    .maybeSingle();
  if (!attribution) return;

  const { data: portal } = await admin
    .from("portals")
    .select("access_model,student_portal_features")
    .eq("id", attribution.portal_id)
    .maybeSingle();
  if (!portal || !referralsEnabled(portal as ReferralPortal)) return;

  const { data: application } = await admin
    .from("student_applications")
    .select("full_name")
    .eq("id", subscription.student_application_id)
    .maybeSingle();

  const { error } = await admin.from("referral_commissions").insert({
    trader_id: attribution.trader_id,
    portal_id: attribution.portal_id,
    referral_partner_id: attribution.referral_partner_id,
    referral_attribution_id: attribution.id,
    student_subscription_id: subscription.id,
    student_name: application?.full_name ?? "",
    payfast_payment_id: payfastPaymentId,
    plan_id: subscription.plan_id,
    payment_amount_cents: subscription.amount_cents,
    commission_cents: referralCommissionCents(subscription.amount_cents),
    status: "owed",
  });
  if (error && error.code !== "23505") {
    console.warn("[referral] commission insert failed", {
      subscriptionId: subscription.id,
      paymentId: payfastPaymentId,
      code: error.code,
    });
  }
}

/**
 * Counts one visit from an affiliate link. Repeat visits from the same visitor
 * within 30 minutes are ignored so refreshes do not inflate the count.
 */
export async function recordReferralClick(
  admin: AdminClient,
  portal: ReferralPortal,
  input: { code: string; visitorHash: string; landingPath: string },
) {
  const code = normalizeReferralCode(input.code);
  if (!code) return false;
  const { data: partner } = await admin
    .from("referral_partners")
    .select("id,status")
    .eq("portal_id", portal.id)
    .eq("code", code)
    .maybeSingle();
  if (!partner || partner.status === "suspended") return false;
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("referral_clicks")
    .select("id")
    .eq("referral_partner_id", partner.id)
    .eq("visitor_hash", input.visitorHash)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return true;
  await admin.from("referral_clicks").insert({
    trader_id: portal.trader_id,
    portal_id: portal.id,
    referral_partner_id: partner.id,
    visitor_hash: input.visitorHash,
    landing_path: input.landingPath.slice(0, 200),
  });
  return true;
}
