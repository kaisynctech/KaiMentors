import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  brokerName: z.string().trim().min(2).max(120),
  partnerCode: z.string().trim().min(1).max(160),
  affiliateLink: z.string().url().max(1000),
  verificationMethod: z.enum([
    "api",
    "manual_review",
    "screenshot_upload",
  ]),
});

const updateSchema = z.object({
  accountId: z.string().uuid(),
  isActive: z.boolean(),
});

function brokerSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 55);

  return `${base || "broker"}-${crypto.randomUUID().slice(0, 8)}`;
}

async function getWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  return { supabase, traderId: membership.trader_id };
}

export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the broker details." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Broker management is not configured." },
      { status: 503 },
    );
  }

  const input = parsed.data;

  const { data: existingBrokers, error: brokerLookupError } = await admin
    .from("brokers")
    .select("id,name")
    .eq("name", input.brokerName)
    .limit(1);
  if (brokerLookupError) {
    return NextResponse.json(
      { error: "The broker catalog could not be checked." },
      { status: 400 },
    );
  }

  let brokerId = existingBrokers?.[0]?.id as string | undefined;
  let createdBroker = false;
  if (!brokerId) {
    const { data: broker, error: brokerError } = await admin
      .from("brokers")
      .insert({
        name: input.brokerName,
        slug: brokerSlug(input.brokerName),
        adapter_key: "http-json-v1",
        configuration_schema: {},
      })
      .select("id")
      .single();
    if (brokerError || !broker) {
      return NextResponse.json(
        { error: "The broker could not be added." },
        { status: 400 },
      );
    }
    brokerId = broker.id;
    createdBroker = true;
  }

  const { error: connectionError } = await workspace.supabase
    .from("trader_broker_accounts")
    .insert({
      trader_id: workspace.traderId,
      broker_id: brokerId,
      partner_code: input.partnerCode,
      account_label: input.brokerName,
      affiliate_link: input.affiliateLink,
      verification_method: input.verificationMethod,
      public_config: {},
    });

  if (connectionError) {
    if (createdBroker) {
      await admin.from("brokers").delete().eq("id", brokerId);
    }
    const duplicate = connectionError.code === "23505";
    return NextResponse.json(
      {
        error: duplicate
          ? "This partner code is already connected for that broker."
          : "The broker account could not be saved.",
      },
      { status: duplicate ? 409 : 400 },
    );
  }

  return NextResponse.json({ status: "created" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid broker account." }, { status: 400 });
  }

  const { error } = await workspace.supabase
    .from("trader_broker_accounts")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.accountId)
    .eq("trader_id", workspace.traderId);

  if (error) {
    return NextResponse.json(
      { error: "The broker account could not be updated." },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: "updated" });
}
