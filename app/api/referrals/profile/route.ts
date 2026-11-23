import { NextResponse } from "next/server";
import { z } from "zod";
import { loadReferralPortal, normalizeAffiliatePhone } from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  portalSlug: z.string().min(1).max(80),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  country: z.string().trim().min(2).max(60),
  promoChannel: z.string().trim().min(2).max(60),
  promoLink: z.string().trim().max(300).optional(),
});

const PROMO_LINK = /^https?:\/\/[^\s]+$/i;

/** The signed-in affiliate updates their own profile. Email and code cannot change here. */
export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Fill in your name, phone, country, and promotion channel." }, { status: 400 });
  }
  const phone = normalizeAffiliatePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid phone number, including the country code if you are outside South Africa." }, { status: 400 });
  }
  const promoLink = parsed.data.promoLink?.trim() || null;
  if (promoLink && !PROMO_LINK.test(promoLink)) {
    return NextResponse.json({ error: "Your website or profile link must start with http:// or https://." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in again to save your profile." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Affiliates are not available." }, { status: 503 });
  const portal = await loadReferralPortal(admin, parsed.data.portalSlug);
  if (!portal) return NextResponse.json({ error: "This academy is not running an affiliate programme." }, { status: 404 });

  const { data: phoneOwner } = await admin
    .from("referral_partners")
    .select("user_id")
    .eq("portal_id", portal.id)
    .eq("phone", phone)
    .maybeSingle();
  if (phoneOwner && phoneOwner.user_id !== user.id) {
    return NextResponse.json({ error: "That phone number is already linked to another affiliate account." }, { status: 409 });
  }

  const { data, error } = await admin
    .from("referral_partners")
    .update({
      full_name: parsed.data.fullName,
      phone,
      country: parsed.data.country,
      promo_channel: parsed.data.promoChannel,
      promo_link: promoLink,
      updated_at: new Date().toISOString(),
    })
    .eq("portal_id", portal.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Your profile could not be saved." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
