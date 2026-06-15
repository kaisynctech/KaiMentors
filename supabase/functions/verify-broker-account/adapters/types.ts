export interface BrokerCredentials {
  apiKey?: string;
  apiSecret?: string;
  partnerId?: string;
  [key: string]: string | undefined;
}

export interface VerificationInput {
  brokerAccountIdentifier: string;
  partnerCode: string;
  credentials: BrokerCredentials;
  publicConfig: Record<string, unknown>;
}

export interface VerificationResult {
  verified: boolean;
  requiresManualReview?: boolean;
  code: string;
  summary: Record<string, unknown>;
}

export interface BrokerAdapter {
  verifyAffiliateAccount(
    input: VerificationInput,
  ): Promise<VerificationResult>;
  healthCheck(credentials: BrokerCredentials): Promise<boolean>;
}
