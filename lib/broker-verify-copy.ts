export const XM_ADAPTER_KEY = "xm-mypartners-v1";

export function isXmBrokerName(name: string | null | undefined) {
  return /xm/i.test(name ?? "");
}

export function isXmAdapterKey(adapterKey: string | null | undefined) {
  return adapterKey === XM_ADAPTER_KEY || /xm/i.test(adapterKey ?? "");
}

export function affiliateMismatchMessage(isXm: boolean) {
  if (isXm) {
    return "This XM ID is not registered under this mentor. Open your XM account with this academy's partner link, or check the number and try again.";
  }
  return "This account number is not registered under this mentor. Check the number, or open an account with this academy's partner link.";
}

export function requiredAccountNumberMessage(isXm: boolean) {
  return isXm
    ? "Enter your XM client ID number. You cannot leave this blank."
    : "Enter your trading account number. You cannot leave this blank.";
}
