export type PortalAccessPolicy = {
  requireBrokerVerificationForModules: boolean;
  allowFullAccessWithoutVerification: boolean;
};

export type StudentApplicationAccess = {
  status: string;
  brokerVerified?: boolean | null;
};

export function parsePortalAccessPolicy(portal: {
  require_broker_verification_for_modules?: boolean | null;
  allow_full_access_without_verification?: boolean | null;
}): PortalAccessPolicy {
  return {
    requireBrokerVerificationForModules:
      portal.require_broker_verification_for_modules ?? true,
    allowFullAccessWithoutVerification:
      portal.allow_full_access_without_verification ?? false,
  };
}

export function hasStudentModuleAccess(
  application: StudentApplicationAccess,
  policy: PortalAccessPolicy,
): boolean {
  if (application.status === "rejected") return false;
  if (policy.allowFullAccessWithoutVerification) return true;
  if (policy.requireBrokerVerificationForModules) {
    return (
      application.brokerVerified === true || application.status === "verified"
    );
  }
  return false;
}

export function isBrokerVerificationRequiredForModules(
  policy: PortalAccessPolicy,
): boolean {
  return (
    policy.requireBrokerVerificationForModules &&
    !policy.allowFullAccessWithoutVerification
  );
}

export function isOpenWithOptionalBrokerVerify(
  policy: PortalAccessPolicy,
): boolean {
  return (
    policy.requireBrokerVerificationForModules &&
    policy.allowFullAccessWithoutVerification
  );
}

export function shouldShowBrokerVerificationUI(
  policy: PortalAccessPolicy,
  hasActiveBrokers: boolean,
  application: StudentApplicationAccess,
): boolean {
  if (!hasActiveBrokers) return false;
  if (application.status === "rejected") return false;
  if (application.brokerVerified || application.status === "verified") {
    return false;
  }

  if (isBrokerVerificationRequiredForModules(policy)) return true;
  if (isOpenWithOptionalBrokerVerify(policy)) return true;

  if (
    policy.allowFullAccessWithoutVerification &&
    !policy.requireBrokerVerificationForModules
  ) {
    return hasActiveBrokers;
  }

  return false;
}

export function accessPolicyHelperCopy(policy: PortalAccessPolicy): string {
  if (isBrokerVerificationRequiredForModules(policy)) {
    return "Students must verify with a partner broker before courses and academy content unlock.";
  }
  if (
    policy.allowFullAccessWithoutVerification &&
    !policy.requireBrokerVerificationForModules
  ) {
    return "All enrolled students get full content access. Broker verification is not required.";
  }
  return "All students get full access. If you have broker partners configured, students can still verify — verified students are tagged for partner benefits (coming soon).";
}

export function validateAccessPolicy(policy: PortalAccessPolicy): string | null {
  if (
    !policy.requireBrokerVerificationForModules &&
    !policy.allowFullAccessWithoutVerification
  ) {
    return "At least one student access option must be enabled.";
  }
  return null;
}
