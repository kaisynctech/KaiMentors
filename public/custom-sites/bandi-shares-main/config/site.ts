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

/**
 * Member discount on Whop programs for verified XM accounts under PARTNER_CODE.
 * Set when Bandile confirms the percentage (e.g. "15" → "15% off").
 */
export const XM_MEMBER_DISCOUNT_PERCENT: string | null = null

export function xmMemberDiscountLabel() {
  if (XM_MEMBER_DISCOUNT_PERCENT) {
    return `${XM_MEMBER_DISCOUNT_PERCENT}% member discount on all programs`
  }
  return 'Member discount on all programs for verified XM accounts'
}

/** Shown wherever we explain where discounted Whop links live. */
export const XM_DISCOUNT_PORTAL_NOTE =
  'Discounted program links appear inside your student portal after you sign in and your XM account is verified — not on this public website.'
