import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  surname: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(20),
  xm_account_id: z.string().trim().min(4).max(40),
  portal_slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Please check the verification details." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Verification is not configured." },
      { status: 503 },
    );
  }

  const portalSlug = parsed.data.portal_slug ?? "bandi-shares";
  const { data: portal } = await admin
    .from("portals")
    .select("id,trader_id,slug")
    .eq("slug", portalSlug)
    .maybeSingle();

  if (!portal) {
    return NextResponse.json({ message: "Academy not found." }, { status: 404 });
  }

  const { data: brokerAccount } = await admin
    .from("trader_broker_accounts")
    .select("id,partner_code,affiliate_link,verification_method")
    .eq("trader_id", portal.trader_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  await admin.from("audit_logs").insert({
    trader_id: portal.trader_id,
    action: "public.xm_verification_submitted",
    entity_type: "portals",
    entity_id: portal.id,
    metadata: {
      email: parsed.data.email,
      phone: parsed.data.phone,
      xm_account_id: parsed.data.xm_account_id,
      name: parsed.data.name,
      surname: parsed.data.surname,
      source: "custom_site_verify_form",
    },
  });

  if (!brokerAccount || brokerAccount.verification_method !== "api") {
    return NextResponse.json({
      type: "PENDING_SIGNUP",
      affiliateCode: brokerAccount?.partner_code ?? "BANDISHARES05",
      affiliateLink: brokerAccount?.affiliate_link ?? "https://www.xm.com",
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Verification submitted. We will confirm your XM partnership shortly.",
  });
}
