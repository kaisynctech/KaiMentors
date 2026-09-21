export const XM_ADAPTER_KEY = "xm-mypartners-v1";

export function isXmBrokerName(name: string | null | undefined) {
  return /xm/i.test(name ?? "");
}

export function isXmAdapterKey(adapterKey: string | null | undefined) {
  return adapterKey === XM_ADAPTER_KEY || /xm/i.test(adapterKey ?? "");
}

export function affiliateMismatchMessage(isXm: boolean) {
  if (isXm) {
    return "This XM ID is not under this academy. Open your XM account with this academy's partner link, or check the number and try again.";
  }
  return "This account number is not under this academy. Check the number, or open an account with this academy's partner link.";
}

export function affiliateMismatchStatusLabel(isXm: boolean) {
  return isXm
    ? "XM ID is not under this academy"
    : "Account is not under this academy";
}

export function requiredAccountNumberMessage(isXm: boolean) {
  return isXm
    ? "Enter your XM client ID number. You cannot leave this blank."
    : "Enter your trading account number. You cannot leave this blank.";
}

export function isAffiliateMismatchReason(reason: string | null | undefined) {
  return reason === "AFFILIATE_MISMATCH";
}
