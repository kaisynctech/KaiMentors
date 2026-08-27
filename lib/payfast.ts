import "server-only";
import { createHash } from "node:crypto";

// MB-118 NOTE — resolving a real contradiction in the brief:
// The brief lists "payment_status === COMPLETE" and "m_payment_id row is in pending
// status" as universal ITN validation steps that "must all pass before trusting the
// notification." Taken literally, that would make validateITN() always reject CANCELLED
// and FAILED notifications (their payment_status is never COMPLETE, and a CANCELLED
// notification for an already-active subscription references a row that is 'active', not
// 'pending') — which would make the brief's own CANCELLED/FAILED handling branches in the
// webhook route unreachable dead code. validateITN() here performs only the checks that
// are universally valid for every notification type: signature authenticity and PayFast's
// own server-side "is this postback really from us" validation. The payment_status branch
// and the amount/row-status business checks live in the webhook route itself, applied per
// branch — see app/api/webhooks/payfast/route.ts.

function pfEncode(value: string): string {
  // PayFast's signature spec matches PHP's urlencode() (spaces -> '+'), not
  // encodeURIComponent's %20 — must match exactly or the signature won't verify.
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function buildSignatureString(
  params: Record<string, string | undefined>,
  passphrase: string | undefined,
): string {
  const pairs = Object.keys(params)
    .filter((key) => key !== "signature")
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${pfEncode(String(params[key]))}`);

  if (passphrase) {
    pairs.push(`passphrase=${pfEncode(passphrase)}`);
  }

  return pairs.join("&");
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function isSandbox(): boolean {
  return process.env.PAYFAST_SANDBOX !== "false";
}

export function getProcessUrl(): string {
  return isSandbox()
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

function getValidateUrl(): string {
  return isSandbox()
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate";
}

// PayFast's subscription management API base. The brief gives only this one URL with no
// sandbox variant — used as-is for both modes. Verify against PayFast's live docs before
// go-live; if sandbox testing needs a distinct host this will need updating.
const MANAGEMENT_API_BASE = "https://api.payfast.co.za";

export function buildPayFastFormFields(
  params: Record<string, string>,
): Record<string, string> {
  const passphrase = process.env.PAYFAST_PASSPHRASE;
  const signature = md5(buildSignatureString(params, passphrase));
  return { ...params, signature };
}

export async function validateITN(
  body: Record<string, string>,
): Promise<{ valid: boolean; reason?: string }> {
  const passphrase = process.env.PAYFAST_PASSPHRASE;
  const expectedSignature = md5(buildSignatureString(body, passphrase));
  if (expectedSignature !== body.signature) {
    return { valid: false, reason: "signature_mismatch" };
  }

  try {
    const validateBody = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (key === "signature") continue;
      validateBody.set(key, value);
    }
    validateBody.set("signature", body.signature);

    const response = await fetch(getValidateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: validateBody.toString(),
      // The webhook route that calls this must respond to PayFast within 10s total —
      // budget this call at 6s so there's still headroom for the DB writes that follow.
      signal: AbortSignal.timeout(6000),
    });
    const text = (await response.text()).trim();
    if (text !== "VALID") {
      return { valid: false, reason: `payfast_validate_returned_${text || "empty"}` };
    }
  } catch (error) {
    return {
      valid: false,
      reason: `payfast_validate_request_failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return { valid: true };
}

function managementApiSignature(timestamp: string): string {
  const merchantId = process.env.PAYFAST_MERCHANT_ID ?? "";
  const passphrase = process.env.PAYFAST_PASSPHRASE ?? "";
  // Matches the key=value&... + passphrase convention used everywhere else in PayFast's
  // signature scheme (ITN, checkout form). The brief's prose ("MD5 of merchant-id +
  // passphrase + timestamp") is ambiguous between this and a raw value concatenation —
  // this is the form consistent with PayFast's documented convention elsewhere; confirm
  // against their live API docs before go-live.
  const signatureString = buildSignatureString(
    { "merchant-id": merchantId, timestamp },
    passphrase,
  );
  return md5(signatureString);
}

async function managementApiRequest(
  method: "PUT" | "GET",
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const timestamp = new Date().toISOString();
  const merchantId = process.env.PAYFAST_MERCHANT_ID ?? "";
  const response = await fetch(`${MANAGEMENT_API_BASE}${path}`, {
    method,
    headers: {
      "merchant-id": merchantId,
      version: "v1",
      timestamp,
      signature: managementApiSignature(timestamp),
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON response — leave body null
  }
  return { ok: response.ok, status: response.status, body };
}

export async function cancelSubscription(
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  return managementApiRequest("PUT", `/subscriptions/${encodeURIComponent(token)}/cancel`);
}

export async function fetchSubscription(
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  return managementApiRequest("GET", `/subscriptions/${encodeURIComponent(token)}/fetch`);
}
