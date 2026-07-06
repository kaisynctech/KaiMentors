export const PARTNER_CODE = 'BANDISHARES05'

/** KaiMentors academy portal slug */
export const PORTAL_SLUG = 'bandi-shares'

function portalHref(
  segment: 'join-academy' | 'login',
  envOverride: string | undefined,
  shortPath: string,
) {
  if (envOverride) return envOverride

  const origin = process.env.NEXT_PUBLIC_PLATFORM_ORIGIN?.replace(/\/$/, '')
  if (origin) {
    return `${origin}/portal/${PORTAL_SLUG}/${segment}`
  }

  return shortPath
}

/**
 * KaiMentors portal auth routes.
 * Default: /join-academy and /login (custom domain convention).
 * Set NEXT_PUBLIC_PLATFORM_ORIGIN for cross-domain links to kaimentors.vercel.app.
 */
export const PORTAL_LINKS = {
  join: portalHref(
    'join-academy',
    process.env.NEXT_PUBLIC_PORTAL_JOIN_HREF,
    '/join-academy',
  ),
  login: portalHref(
    'login',
    process.env.NEXT_PUBLIC_PORTAL_LOGIN_HREF,
    '/login',
  ),
} as const

export const XM_LINKS = {
  app: 'https://www.xm.com/app',
  register: 'https://www.xm.com',
} as const
