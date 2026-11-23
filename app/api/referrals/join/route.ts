import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import {
  AFFILIATE_TERMS_VERSION,
  ReferralDuplicateError,
  createReferralPartner,
  loadReferralPortal,
  normalizeAffiliatePhone,
} from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const joinSchema = z.object({
  portalSlug: z.string().min(1).max(80),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  password: z.string().min(10).max(128).optional(),
  phone: z.string().trim().min(7).max(24),
  country: z.string().trim().min(2).max(60),
  promoChannel: z.string().trim().min(2).max(60),
  promoLink: z.string().trim().max(300).optional(),
  acceptTerms: z.literal(true),
});

const PROMO_LINK = /^https?:\/\/[^\s]+$/i;

function shareUrls(request: Request, slug: string, code: string) {
  const hostname = normalizeRequestHostname(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      "",
  );
  const origin = `${new URL(request.url).protocol}//${hostname}`;
  const joinPath = isPlatformHostname(hostname)
    ? `/portal/${slug}/join-academy?ref=${code}`
    : `/join-academy?ref=${code}`;
  const loginPath = isPlatformHostname(hostname)
    ? `/portal/${slug}/login?next=${encodeURIComponent(`/portal/${slug}/referrals`)}`
    : `/login?next=${encodeURIComponent("/referrals")}`;
  const homePath = isPlatformHostname(hostname) ? `/portal/${slug}?ref=${code}` : `/?ref=${code}`;
  const dashboardPath = isPlatformHostname(hostname) ? `/portal/${slug}/referrals` : "/referrals";
  return {
    shareUrl: `${origin}${homePath}`,
    joinUrl: `${origin}${joinPath}`,
    loginUrl: `${origin}${loginPath}`,
    dashboardUrl: `${origin}${dashboardPath}`,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Fill in every field, accept the affiliate terms, and use a password of at least 10 characters.",
      },
      { status: 400 },
    );
  }
  const phone = normalizeAffiliatePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid phone number, including the country code if you are outside South Africa." },
      { status: 400 },
    );
  }
  const promoLink = parsed.data.promoLink?.trim() || null;
  if (promoLink && !PROMO_LINK.test(promoLink)) {
    return NextResponse.json(
      { error: "Your website or profile link must start with http:// or https://." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Referrals are not available." }, { status: 503 });
  }
  const portal = await loadReferralPortal(admin, parsed.data.portalSlug);
  if (!portal) {
    return NextResponse.json(
      { error: "This academy is not running a referral programme." },
      { status: 404 },
    );
  }

  const { data: phoneTaken } = await admin
    .from("referral_partners")
    .select("id,user_id")
    .eq("portal_id", portal.id)
    .eq("phone", phone)
    .maybeSingle();

  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (phoneTaken && phoneTaken.user_id !== user?.id) {
    return NextResponse.json(
      { error: "That phone number is already linked to an affiliate account. Sign in to open it." },
      { status: 409 },
    );
  }
  let userId = user?.id ?? null;
  let signedIn = Boolean(user);
  let fullName = parsed.data.fullName?.trim() ?? "";
  let email = parsed.data.email?.trim().toLowerCase() ?? user?.email?.toLowerCase() ?? "";

  if (user) {
    if (parsed.data.email && parsed.data.email.trim().toLowerCase() !== user.email?.toLowerCase()) {
      return NextResponse.json(
        { error: "Sign out before creating a referral code for a different email." },
        { status: 400 },
      );
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name,email")
      .eq("id", user.id)
      .maybeSingle();
    fullName = fullName || profile?.full_name?.trim() || "";
    email = email || profile?.email?.toLowerCase() || "";
  } else {
    if (!fullName || !email || !parsed.data.password) {
      return NextResponse.json(
        { error: "Name, email, and a password of at least 10 characters are required." },
        { status: 400 },
      );
    }
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error:
            "That email already has an account. Sign in, then open the Affiliate dashboard to get your code.",
        },
        { status: 409 },
      );
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "student" },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes("already");
      return NextResponse.json(
        {
          error: duplicate
            ? "That email already has an account. Sign in, then open the Affiliate dashboard to get your code."
            : "The referral account could not be created.",
        },
        { status: duplicate ? 409 : 400 },
      );
    }
    userId = created.user.id;
    if (supabase) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      });
      signedIn = !signInError;
    }
  }

  if (!userId || !email || fullName.length < 2) {
    return NextResponse.json(
      { error: "Add your name before creating a referral code." },
      { status: 400 },
    );
  }

  try {
    const partner = await createReferralPartner(admin, portal, {
      userId,
      fullName,
      email,
      phone,
      country: parsed.data.country,
      promoChannel: parsed.data.promoChannel,
      promoLink,
      termsVersion: AFFILIATE_TERMS_VERSION,
    });
    const urls = shareUrls(request, portal.slug, partner.code);
    return NextResponse.json({
      code: partner.code,
      signedIn,
      dashboardUrl: urls.dashboardUrl,
      ...urls,
    });
  } catch (error) {
    if (error instanceof ReferralDuplicateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "The referral code could not be created." },
      { status: 500 },
    );
  }
}
