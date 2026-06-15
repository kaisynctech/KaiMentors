import "server-only";
import type {
  DomainProvider,
  DomainProviderState,
  DomainVerificationRecord,
} from "@/lib/domains/types";

interface VercelDomainResponse {
  name?: string;
  projectId?: string;
  verified?: boolean;
  misconfigured?: boolean;
  verification?: Array<{
    type?: string;
    domain?: string;
    value?: string;
    reason?: string;
  }>;
  recommendedCNAME?: Array<{ rank?: number; value?: string }> | string[];
  recommendedIPv4?: Array<{ rank?: number; value?: string }> | string[];
  error?: {
    code?: string;
    message?: string;
  };
}

export class DomainProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function providerState(
  hostname: string,
  response: VercelDomainResponse,
): DomainProviderState {
  const verificationRecords = (response.verification ?? [])
    .filter((record) => record.type && record.value)
    .map(
      (record): DomainVerificationRecord => ({
        type: String(record.type).toUpperCase(),
        domain: record.domain || hostname,
        value: String(record.value),
        reason: record.reason,
      }),
    );

  return {
    providerDomainId: response.name ?? hostname,
    verified: Boolean(response.verified),
    misconfigured: Boolean(response.misconfigured),
    verificationRecords,
    metadata: {
      projectId: response.projectId ?? null,
      provider: "vercel",
      recommendedCNAME: response.recommendedCNAME ?? [],
      recommendedIPv4: response.recommendedIPv4 ?? [],
    },
  };
}

class VercelDomainProvider implements DomainProvider {
  private readonly token: string;
  private readonly projectId: string;
  private readonly teamId: string | null;

  constructor() {
    this.token = process.env.VERCEL_TOKEN ?? "";
    this.projectId =
      process.env.VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_NAME ?? "";
    this.teamId = process.env.VERCEL_TEAM_ID ?? null;

    if (!this.token || !this.projectId) {
      throw new DomainProviderError(
        "Custom-domain automation is not configured.",
        "provider_not_configured",
        503,
      );
    }
  }

  private url(path: string) {
    const url = new URL(`https://api.vercel.com${path}`);
    if (this.teamId) url.searchParams.set("teamId", this.teamId);
    return url;
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<VercelDomainResponse> {
    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as VercelDomainResponse;

    if (!response.ok) {
      throw new DomainProviderError(
        payload.error?.message ?? "The deployment provider rejected the domain request.",
        payload.error?.code ?? "provider_request_failed",
        response.status,
      );
    }

    return payload;
  }

  async add(hostname: string) {
    try {
      const response = await this.request(
        `/v10/projects/${encodeURIComponent(this.projectId)}/domains`,
        {
          method: "POST",
          body: JSON.stringify({ name: hostname }),
        },
      );
      return providerState(hostname, response);
    } catch (error) {
      if (error instanceof DomainProviderError && error.status === 409) {
        return this.inspect(hostname);
      }
      throw error;
    }
  }

  async inspect(hostname: string) {
    const response = await this.request(
      `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(hostname)}`,
      { method: "GET" },
    );
    return providerState(hostname, response);
  }

  async verify(hostname: string) {
    const response = await this.request(
      `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
      { method: "POST" },
    );
    return providerState(hostname, response);
  }

  async remove(hostname: string) {
    await this.request(
      `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(hostname)}`,
      { method: "DELETE" },
    );
  }
}

export function createDomainProvider(): DomainProvider {
  return new VercelDomainProvider();
}
