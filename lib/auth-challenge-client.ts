export type AuthChallengePurpose = "invitation" | "signup" | "recovery" | "email_change";

export async function requestAuthChallenge(
  email: string,
  purpose: AuthChallengePurpose,
  resend = false,
) {
  const response = await fetch("/api/auth/challenges/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, purpose, resend }),
  });
  const payload = (await response.json()) as {
    error?: string;
    retryAfterSeconds?: number;
  };
  if (!response.ok) {
    const error = new Error(payload.error ?? "The verification code could not be sent.");
    Object.assign(error, { retryAfterSeconds: payload.retryAfterSeconds });
    throw error;
  }
  return payload;
}
