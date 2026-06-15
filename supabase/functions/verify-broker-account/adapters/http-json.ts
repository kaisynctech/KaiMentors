import type {
  BrokerAdapter,
  VerificationInput,
  VerificationResult,
} from "./types.ts";

export class HttpJsonBrokerAdapter implements BrokerAdapter {
  async verifyAffiliateAccount(
    input: VerificationInput,
  ): Promise<VerificationResult> {
    const endpoint = input.publicConfig.verificationEndpoint;
    if (typeof endpoint !== "string") {
      return {
        verified: false,
        requiresManualReview: true,
        code: "ADAPTER_CONFIGURATION_INCOMPLETE",
        summary: {},
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.credentials.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        accountId: input.brokerAccountIdentifier,
        partnerCode: input.partnerCode,
      }),
    });

    if (!response.ok) {
      return {
        verified: false,
        requiresManualReview: response.status >= 500,
        code: `BROKER_HTTP_${response.status}`,
        summary: {},
      };
    }

    const payload = await response.json();
    return {
      verified: payload.verified === true,
      code: payload.verified === true ? "AFFILIATE_MATCH" : "AFFILIATE_MISMATCH",
      summary: {
        accountFound: payload.accountFound === true,
        affiliateMatched: payload.affiliateMatched === true,
      },
    };
  }

  async healthCheck(credentials: Record<string, string | undefined>) {
    return Boolean(credentials.apiKey);
  }
}
