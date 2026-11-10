const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeReferralCode(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

export function generateReferralCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(
    "",
  );
}

/** 10% of the payment, in cents. Amounts are whole rands, so this stays exact. */
export function referralCommissionCents(paymentAmountCents: number) {
  if (!Number.isInteger(paymentAmountCents) || paymentAmountCents < 0) {
    throw new Error("Payment amount must be a non-negative number of cents.");
  }
  return Math.round((paymentAmountCents * 10) / 100);
}

export function formatZarFromCents(cents: number) {
  return `R${(cents / 100).toFixed(2)}`;
}
