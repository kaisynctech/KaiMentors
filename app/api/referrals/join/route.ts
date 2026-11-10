import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import {
  createReferralPartner,
  loadReferralPortal,
} from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const joinSchema = z.object({
  portalSlug: z.string().min(1).max(80),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  password: z.string().min(10).max(128).optional(),
});

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
  return {
    shareUrl: `${origin}${joinPath}`,
    loginUrl: `${origin}${loginPath}`,
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
      { error: "Check your name, email, and password, then try again." },
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

  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  let userId = user?.id ?? null;
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
            "That email already has an account. Sign in, then open Referrals to get your code.",
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
            ? "That email already has an account. Sign in, then open Referrals to get your code."
            : "The referral account could not be created.",
        },
        { status: duplicate ? 409 : 400 },
      );
    }
    userId = created.user.id;
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
    });
    return NextResponse.json({
      code: partner.code,
      ...shareUrls(request, portal.slug, partner.code),
    });
  } catch {
    return NextResponse.json(
      { error: "The referral code could not be created." },
      { status: 500 },
    );
  }
}
