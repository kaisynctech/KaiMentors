export const PORTAL_FEATURE_KEYS = [
  "courses",
  "community",
  "live_classes",
  "bookings",
  "groups",
  "messages",
  "resources",
  "projects",
  "broker",
] as const;

export type PortalFeatureKey = (typeof PORTAL_FEATURE_KEYS)[number];

export type PortalAccessModel = "verification" | "subscription";

export type PortalFeatureDefinition = {
  key: PortalFeatureKey;
  label: string;
  description: string;
  /** Core modules default on. Broker defaults on for verification academies only. */
  defaultEnabled: true | false | "verification-only";
  mentorHref?: string;
  studentNav?: Array<{
    hrefSuffix: string;
    label: string;
  }>;
};

export const PORTAL_FEATURE_CATALOG: readonly PortalFeatureDefinition[] = [
  {
    key: "courses",
    label: "Courses",
    description: "Course library for mentors and student lessons.",
    defaultEnabled: true,
    mentorHref: "/dashboard/courses",
    studentNav: [{ hrefSuffix: "/courses", label: "My Courses" }],
  },
  {
    key: "community",
    label: "Community",
    description: "Gallery, trade posts, and community feed.",
    defaultEnabled: true,
    mentorHref: "/dashboard/community",
    studentNav: [{ hrefSuffix: "/community", label: "Community" }],
  },
  {
    key: "live_classes",
    label: "Live classes",
    description: "Scheduled live classes for the academy.",
    defaultEnabled: true,
    mentorHref: "/dashboard/live-classes",
    studentNav: [{ hrefSuffix: "/live-classes", label: "Live Classes" }],
  },
  {
    key: "bookings",
    label: "Bookings",
    description: "One-to-one session types, availability, and student booking.",
    defaultEnabled: true,
    mentorHref: "/dashboard/bookings",
    studentNav: [
      { hrefSuffix: "/bookings", label: "Book a session" },
      { hrefSuffix: "/bookings/sessions", label: "My sessions" },
    ],
  },
  {
    key: "groups",
    label: "Groups",
    description: "Student groups on the mentor dashboard and in the student portal.",
    defaultEnabled: true,
    mentorHref: "/dashboard/groups",
    studentNav: [{ hrefSuffix: "/groups", label: "Groups" }],
  },
  {
    key: "messages",
    label: "Messages",
    description: "Direct messages between mentors and students.",
    defaultEnabled: true,
    mentorHref: "/dashboard/messages",
    studentNav: [{ hrefSuffix: "/messages", label: "Messages" }],
  },
  {
    key: "resources",
    label: "Resources",
    description: "Downloadable academy resources.",
    defaultEnabled: true,
    mentorHref: "/dashboard/resources",
    studentNav: [{ hrefSuffix: "/resources", label: "Resources" }],
  },
  {
    key: "projects",
    label: "Projects",
    description:
      "Student project showcase on the mentor dashboard, student portal, and academy website.",
    defaultEnabled: false,
    mentorHref: "/dashboard/projects",
    studentNav: [{ hrefSuffix: "/projects", label: "Projects" }],
  },
  {
    key: "broker",
    label: "Broker / Open account",
    description:
      "Partner broker onboarding for students. Off by default on subscription academies.",
    defaultEnabled: "verification-only",
    studentNav: [{ hrefSuffix: "/broker", label: "Open Account" }],
  },
];

export const MENTOR_NAV_FEATURE_BY_HREF: Record<string, PortalFeatureKey> = {
  "/dashboard/groups": "groups",
  "/dashboard/messages": "messages",
  "/dashboard/community": "community",
  "/dashboard/courses": "courses",
  "/dashboard/resources": "resources",
  "/dashboard/projects": "projects",
  "/dashboard/live-classes": "live_classes",
  "/dashboard/bookings": "bookings",
};

export function isPortalFeatureKey(value: string): value is PortalFeatureKey {
  return (PORTAL_FEATURE_KEYS as readonly string[]).includes(value);
}

function defaultFor(
  definition: PortalFeatureDefinition,
  accessModel: PortalAccessModel,
): boolean {
  if (definition.defaultEnabled === "verification-only") {
    return accessModel !== "subscription";
  }
  return definition.defaultEnabled;
}

export function resolvePortalFeatures(
  stored: Record<string, boolean> | null | undefined,
  accessModel: PortalAccessModel = "verification",
): Record<PortalFeatureKey, boolean> {
  const resolved = {} as Record<PortalFeatureKey, boolean>;
  for (const definition of PORTAL_FEATURE_CATALOG) {
    const value = stored?.[definition.key];
    resolved[definition.key] =
      typeof value === "boolean" ? value : defaultFor(definition, accessModel);
  }
  return resolved;
}

export function isPortalFeatureEnabled(
  stored: Record<string, boolean> | null | undefined,
  key: PortalFeatureKey,
  accessModel: PortalAccessModel = "verification",
): boolean {
  return resolvePortalFeatures(stored, accessModel)[key] === true;
}

/**
 * Extra / future flags (e.g. ai_tools) are opt-in. Missing means off.
 * Catalog keys use resolvePortalFeatures defaults instead.
 */
export function isFeatureEnabled(
  features: Record<string, boolean> | undefined | null,
  key: string,
): boolean {
  if (isPortalFeatureKey(key)) {
    return isPortalFeatureEnabled(features, key);
  }
  if (!features) return false;
  return features[key] === true;
}

export function isSubscriptionPortal(
  accessModel: PortalAccessModel | undefined | null,
): boolean {
  return accessModel === "subscription";
}

export function sanitizePortalFeatureMap(
  input: Record<string, unknown>,
): Record<PortalFeatureKey, boolean> | null {
  const sanitized = {} as Record<PortalFeatureKey, boolean>;
  for (const key of PORTAL_FEATURE_KEYS) {
    if (typeof input[key] !== "boolean") return null;
    sanitized[key] = input[key];
  }
  return sanitized;
}

export function mentorNavHrefsForFeatures(
  stored: Record<string, boolean> | null | undefined,
  accessModel: PortalAccessModel,
): Set<string> {
  const resolved = resolvePortalFeatures(stored, accessModel);
  const hrefs = new Set<string>();
  for (const [href, key] of Object.entries(MENTOR_NAV_FEATURE_BY_HREF)) {
    if (resolved[key]) hrefs.add(href);
  }
  return hrefs;
}
