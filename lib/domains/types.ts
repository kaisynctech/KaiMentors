export type DomainLifecycleStatus =
  | "requested"
  | "verification_required"
  | "configuring"
  | "active"
  | "failed"
  | "disabled";

export interface DomainVerificationRecord {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface WebsiteDomain {
  id: string;
  trader_id: string;
  portal_id: string;
  hostname: string;
  provider: "vercel";
  provider_domain_id: string | null;
  is_primary: boolean;
  redirect_to_primary: boolean;
  ownership_status: "pending" | "verified" | "failed";
  dns_status: "pending" | "configured" | "misconfigured" | "failed";
  ssl_status: "pending" | "provisioning" | "ready" | "failed";
  auth_status: "pending" | "configured" | "failed";
  status: DomainLifecycleStatus;
  verification_records: DomainVerificationRecord[];
  provider_metadata: Record<string, unknown>;
  failure_code: string | null;
  failure_message: string | null;
  last_checked_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainProviderState {
  providerDomainId: string | null;
  verified: boolean;
  misconfigured: boolean;
  verificationRecords: DomainVerificationRecord[];
  metadata: Record<string, unknown>;
}

export interface DomainProvider {
  add(hostname: string): Promise<DomainProviderState>;
  inspect(hostname: string): Promise<DomainProviderState>;
  verify(hostname: string): Promise<DomainProviderState>;
  remove(hostname: string): Promise<void>;
}
