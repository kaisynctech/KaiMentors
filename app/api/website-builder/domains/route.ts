import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createDomainProvider,
  DomainProviderError,
} from "@/lib/domains/provider";
import { isPlatformHostname, normalizeHostname } from "@/lib/domains/hostnames";
import type { DomainProviderState, WebsiteDomain } from "@/lib/domains/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    hostname: z.string().trim().min(4).max(253),
    portalId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("refresh"),
    domainId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("set_primary"),
    domainId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("remove"),
    domainId: z.string().uuid(),
  }),
]);

function lifecycleFromProvider(state: DomainProviderState) {
  if (state.verified && !state.misconfigured) {
    return {
      ownership_status: "verified",
      dns_status: "configured",
      ssl_status: "ready",
      auth_status: "configured",
      status: "active",
      activated_at: new Date().toISOString(),
    } as const;
  }

  if (!state.verified) {
    return {
      ownership_status: "pending",
      dns_status: state.misconfigured ? "misconfigured" : "pending",
      ssl_status: "pending",
      auth_status: "configured",
      status: "verification_required",
      activated_at: null,
    } as const;
  }

  return {
    ownership_status: "verified",
    dns_status: "misconfigured",
    ssl_status: "provisioning",
    auth_status: "configured",
    status: "configuring",
    activated_at: null,
  } as const;
}

async function writeEvent(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  input: {
    domainId: string | null;
    traderId: string;
    portalId: string;
    actorUserId: string;
    eventType: string;
    hostname: string;
    previousStatus?: string | null;
    nextStatus?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await admin.from("website_domain_events").insert({
    domain_id: input.domainId,
    trader_id: input.traderId,
    portal_id: input.portalId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    hostname: input.hostname,
    previous_status: input.previousStatus ?? null,
    next_status: input.nextStatus ?? null,
    details: input.details ?? {},
  });
}

async function loadOwnedDomain(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  domainId: string,
) {
  const { data } = await admin
    .from("website_domains")
    .select("*")
    .eq("id", domainId)
    .maybeSingle();
  return data as WebsiteDomain | null;
}

async function persistProviderState(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  domain: WebsiteDomain,
  state: DomainProviderState,
) {
  const lifecycle = lifecycleFromProvider(state);
  const { data, error } = await admin
    .from("website_domains")
    .update({
      provider_domain_id: state.providerDomainId,
      ...lifecycle,
      verification_records: state.verificationRecords,
      provider_metadata: state.metadata,
      failure_code: null,
      failure_message: null,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", domain.id)
    .eq("trader_id", domain.trader_id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WebsiteDomain;
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server-side domain management is not configured." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { session } } = supabase
    ? await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 5000),
        ),
      ])
    : { data: { session: null } };
  const user = session?.user ?? null;
  const { data: profile } = user
    ? await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  if (!user || profile?.role !== "super_admin") {
    return NextResponse.json(
      { error: "Super admin access is required." },
      { status: 403 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The domain request is invalid." },
      { status: 400 },
    );
  }

  let provider;
  try {
    provider = createDomainProvider();
  } catch (error) {
    const status = error instanceof DomainProviderError ? error.status : 503;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Custom-domain automation is not configured.",
      },
      { status },
    );
  }

  const input = parsed.data;
  const { data: resolvedPortal } = input.action === "add"
    ? await admin.from("portals").select("id,trader_id").eq("id", input.portalId).maybeSingle()
    : { data: null };
  const existingDomain = input.action === "add" ? null : await loadOwnedDomain(admin, input.domainId);
  const portalId = resolvedPortal?.id ?? existingDomain?.portal_id;
  const traderId = resolvedPortal?.trader_id ?? existingDomain?.trader_id;
  if (!portalId || !traderId) return NextResponse.json({ error: "Academy website not found." }, { status: 404 });
  const workspace = { supabase: supabase!, user, traderId, portal: { id: portalId } };

  if (input.action === "add") {
    let hostname: string;
    try {
      hostname = normalizeHostname(input.hostname);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid domain." },
        { status: 400 },
      );
    }

    if (isPlatformHostname(hostname)) {
      return NextResponse.json(
        { error: "The KaiMentors platform domain cannot be assigned to a tenant." },
        { status: 400 },
      );
    }

    const { data: created, error: reserveError } = await admin
      .from("website_domains")
      .insert({
        trader_id: workspace.traderId,
        portal_id: workspace.portal.id,
        hostname,
        provider: "vercel",
        status: "pending_vercel_setup",
        ownership_status: "pending",
        dns_status: "pending",
        ssl_status: "pending",
        auth_status: "configured",
      })
      .select("*")
      .single();

    if (reserveError || !created) {
      return NextResponse.json(
        {
          error:
            reserveError?.code === "23505"
              ? "That domain is already connected to a KaiMentors website."
              : "The domain could not be reserved.",
        },
        { status: reserveError?.code === "23505" ? 409 : 400 },
      );
    }

    const domain = created as WebsiteDomain;
    await writeEvent(admin, {
      domainId: domain.id,
      traderId: workspace.traderId,
      portalId: workspace.portal.id,
      actorUserId: workspace.user.id,
      eventType: "domain_registered",
      hostname,
      nextStatus: "pending_vercel_setup",
    });

    return NextResponse.json(
      { domain, next_step: "manual_vercel_setup" },
      { status: 201 },
    );
  }

  const domain = existingDomain;
  if (!domain) {
    return NextResponse.json({ error: "Domain not found." }, { status: 404 });
  }

  if (input.action === "set_primary") {
    if (domain.status !== "active") {
      return NextResponse.json(
        { error: "Only an active domain can be made primary." },
        { status: 409 },
      );
    }
    const { error } = await workspace.supabase.rpc(
      "set_primary_website_domain",
      { target_domain_id: domain.id },
    );
    if (error) {
      return NextResponse.json(
        { error: "The primary domain could not be changed." },
        { status: 400 },
      );
    }
    await writeEvent(admin, {
      domainId: domain.id,
      traderId: workspace.traderId,
      portalId: workspace.portal.id,
      actorUserId: workspace.user.id,
      eventType: "primary_domain_changed",
      hostname: domain.hostname,
      previousStatus: domain.status,
      nextStatus: domain.status,
    });
    return NextResponse.json({ status: "primary_updated" });
  }

  if (input.action === "refresh") {
    try {
      const state =
        domain.status === "verification_required"
          ? await provider.verify(domain.hostname)
          : await provider.inspect(domain.hostname);
      const updated = await persistProviderState(admin, domain, state);
      await writeEvent(admin, {
        domainId: domain.id,
        traderId: workspace.traderId,
        portalId: workspace.portal.id,
        actorUserId: workspace.user.id,
        eventType: "domain_status_refreshed",
        hostname: domain.hostname,
        previousStatus: domain.status,
        nextStatus: updated.status,
        details: state.metadata,
      });
      return NextResponse.json({ domain: updated });
    } catch (error) {
      if (error instanceof DomainProviderError && error.status === 404) {
        return NextResponse.json(
          {
            error:
              "This domain has not been added to Vercel yet. Go to the Vercel dashboard → your project → Settings → Domains and add the hostname manually, then use Refresh to sync.",
          },
          { status: 422 },
        );
      }
      const message =
        error instanceof Error
          ? error.message
          : "The domain status could not be refreshed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  try {
    await provider.remove(domain.hostname);
  } catch (error) {
    if (!(error instanceof DomainProviderError && error.status === 404)) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The domain could not be removed from the deployment provider.",
        },
        { status: 502 },
      );
    }
  }

  await writeEvent(admin, {
    domainId: domain.id,
    traderId: workspace.traderId,
    portalId: workspace.portal.id,
    actorUserId: workspace.user.id,
    eventType: "domain_removed",
    hostname: domain.hostname,
    previousStatus: domain.status,
    nextStatus: "disabled",
  });
  const { error: deleteError } = await admin
    .from("website_domains")
    .delete()
    .eq("id", domain.id)
    .eq("trader_id", workspace.traderId);
  if (deleteError) {
    return NextResponse.json(
      { error: "The provider domain was removed, but the local record needs review." },
      { status: 500 },
    );
  }

  if (domain.is_primary) {
    const { data: replacement } = await admin
      .from("website_domains")
      .select("id")
      .eq("portal_id", workspace.portal.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (replacement) {
      await workspace.supabase.rpc("set_primary_website_domain", {
        target_domain_id: replacement.id,
      });
    } else {
      await admin
        .from("portals")
        .update({ custom_domain: null })
        .eq("id", workspace.portal.id);
    }
  }

  return NextResponse.json({ status: "removed" });
}
