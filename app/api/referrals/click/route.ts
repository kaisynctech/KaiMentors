import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadReferralPortal, recordReferralClick } from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";

const clickSchema = z.object({
  portalSlug: z.string().min(1).max(80),
  code: z.string().trim().min(4).max(32),
  path: z.string().max(300).optional(),
});

/** One-way visitor fingerprint. The raw IP address is never stored. */
function visitorHash(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "";
  const agent = request.headers.get("user-agent") ?? "";
  const salt = process.env.REFERRAL_HASH_SALT ?? "kaimentors-referrals";
  return createHash("sha256").update(`${salt}|${ip}|${agent}`).digest("hex");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = clickSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });
  const portal = await loadReferralPortal(admin, parsed.data.portalSlug);
  if (!portal) return NextResponse.json({ ok: false }, { status: 404 });
  const ok = await recordReferralClick(admin, portal, {
    code: parsed.data.code,
    visitorHash: visitorHash(request),
    landingPath: parsed.data.path ?? "",
  });
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
