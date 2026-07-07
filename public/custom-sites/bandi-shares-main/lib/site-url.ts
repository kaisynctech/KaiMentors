import { PORTAL_SLUG } from '@/config/site'

/** Static export root on KaiMentors (matches next.config.js basePath). */
export const SITE_BASE = '/custom-sites/bandi-shares/v1'

/** Default href when embedded on KaiMentors (SSR + first paint). */
export function portalSiteHref(route: string) {
  const normalized = route === '/' ? '' : route.startsWith('/') ? route : `/${route}`
  return normalized ? `/portal/${PORTAL_SLUG}${normalized}` : `/portal/${PORTAL_SLUG}`
}

export function assetUrl(relativePath: string) {
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${SITE_BASE}${normalized}`
}

/**
 * Resolve an internal site route for navigation.
 * When embedded on KaiMentors, links target the parent portal URL so pages load correctly.
 */
export function resolveSiteHref(route: string) {
  if (typeof window === 'undefined') {
    return portalSiteHref(route)
  }

  const normalized = route === '/' ? '' : route.startsWith('/') ? route : `/${route}`
  const top = window.top ?? window
  const topPath = top.location.pathname

  if (topPath.startsWith(`/portal/${PORTAL_SLUG}`)) {
    return normalized
      ? `/portal/${PORTAL_SLUG}${normalized}`
      : `/portal/${PORTAL_SLUG}`
  }

  // Custom academy domain (e.g. sharesworldwide.trade) — clean paths on parent.
  if (top !== window && !topPath.startsWith('/custom-sites')) {
    return normalized || '/'
  }

  return `${SITE_BASE}${normalized || ''}`
}

export function shouldNavigateTopWindow() {
  if (typeof window === 'undefined') return false
  const top = window.top ?? window
  if (top === window) return false
  const topPath = top.location.pathname
  return (
    topPath.startsWith(`/portal/${PORTAL_SLUG}`) ||
    !topPath.startsWith('/custom-sites')
  )
}
