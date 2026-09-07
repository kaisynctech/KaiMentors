import type {
  BrokerAdapter,
  BrokerCredentials,
  VerificationInput,
  VerificationResult,
} from "./types.ts";

export const XM_MYPARTNERS_TRADER_URL =
  "https://mypartners.xm.com/api/traders";

export const XM_FETCH_TIMEOUT_MS = 10_000;

export function resolveXmApiToken(credentials: BrokerCredentials): string {
  const combined = credentials.apiToken ?? credentials.apiKey ?? "";
  if (combined.trim()) return combined.trim();
  return `${credentials.tokenPart1 ?? ""}${credentials.tokenPart2 ?? ""}`.trim();
}

export function interpretXmFetchFailure(error: unknown): VerificationResult {
  const name = error instanceof Error ? error.name : "";
  const timedOut = name === "TimeoutError" || name === "AbortError";
  return {
    verified: false,
    requiresManualReview: true,
    code: timedOut ? "XM_TIMEOUT" : "XM_NETWORK_ERROR",
    summary: { timedOut },
  };
}

export function isXmHtmlGatewayResponse(
  status: number,
  contentType: string,
  payload: unknown,
): boolean {
  if (status !== 401 && status !== 403) return false;
  if (contentType.includes("text/html")) return true;
  if (
    payload &&
    typeof payload === "object" &&
    "raw" in payload &&
    String((payload as { raw: unknown }).raw).trim().startsWith("<")
  ) {
    return true;
  }
  return false;
}

export function interpretXmTraderResponse(
  status: number,
  payload: unknown,
): VerificationResult {
  if (status === 200) {
    const row =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    return {
      verified: true,
      code: row.archived === true ? "AFFILIATE_MATCH_ARCHIVED" : "AFFILIATE_MATCH",
      summary: {
        loginID: row.loginID ?? row.loginId ?? null,
        validated: row.validated === true,
        archived: row.archived === true,
        accountType: row.accountType ?? null,
        serverName: row.serverName ?? null,
      },
    };
  }

  if (status === 404) {
    return {
      verified: false,
      code: "AFFILIATE_MISMATCH",
      summary: { httpStatus: 404 },
    };
  }

  if (status === 401) {
    return {
      verified: false,
      requiresManualReview: true,
      code: "XM_UNAUTHORIZED",
      summary: { httpStatus: 401 },
    };
  }

  if (status === 400) {
    return {
      verified: false,
      requiresManualReview: true,
      code: "XM_BAD_REQUEST",
      summary: { httpStatus: 400 },
    };
  }

  return {
    verified: false,
    requiresManualReview: true,
    code: `BROKER_HTTP_${status}`,
    summary: { httpStatus: status },
  };
}

export class XmMypartnersAdapter implements BrokerAdapter {
  async verifyAffiliateAccount(
    input: VerificationInput,
  ): Promise<VerificationResult> {
    const loginId = String(input.brokerAccountIdentifier ?? "").trim();
    if (!/^[A-Za-z0-9-]+$/.test(loginId)) {
      return {
        verified: false,
        requiresManualReview: true,
        code: "ACCOUNT_ID_REQUIRED",
        summary: {},
      };
    }

    const token = resolveXmApiToken(input.credentials);
    if (!token) {
      return {
        verified: false,
        requiresManualReview: true,
        code: "ADAPTER_CONFIGURATION_INCOMPLETE",
        summary: {},
      };
    }

    let response: Response;
    try {
      response = await fetch(
        `${XM_MYPARTNERS_TRADER_URL}/${encodeURIComponent(loginId)}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(XM_FETCH_TIMEOUT_MS),
        },
      );
    } catch (error) {
      return interpretXmFetchFailure(error);
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text.slice(0, 200) };
      }
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (isXmHtmlGatewayResponse(response.status, contentType, payload)) {
      return {
        verified: false,
        requiresManualReview: true,
        code: "XM_GATEWAY_UNAUTHORIZED",
        summary: { httpStatus: response.status, gateway: true },
      };
    }

    return interpretXmTraderResponse(response.status, payload);
  }

  async healthCheck(credentials: BrokerCredentials) {
    return Boolean(resolveXmApiToken(credentials));
  }
}
