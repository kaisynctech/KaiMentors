/**
 * Returns true if the given feature flag is enabled for this portal.
 * Used to show/hide student portal tabs and mentor settings sections.
 */
export function isFeatureEnabled(
  features: Record<string, boolean> | undefined | null,
  key: string,
): boolean {
  if (!features) return false;
  return features[key] === true;
}

/**
 * Returns true if the portal uses the subscription access model.
 */
export function isSubscriptionPortal(
  accessModel: "verification" | "subscription" | undefined | null,
): boolean {
  return accessModel === "subscription";
}
