import { PORTAL_SLUG } from '@/config/site'

/** Static export root on KaiMentors (matches next.config.js basePath). */
export const SITE_BASE = '/custom-sites/bandi-shares/v1'

function splitRoute(route: string) {
  const [pathPart, hash] = route.split('#')
  const path = pathPart === '/' ? '' : pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  return { path, hash }
}

/** Default href when embedded on KaiMentors (SSR + first paint). */
export function portalSiteHref(route: string) {
  const { path, hash } = splitRoute(route)
  const base = path ? `/portal/${PORTAL_SLUG}${path}` : `/portal/${PORTAL_SLUG}`
  return hash ? `${base}#${hash}` : base
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
  const { path, hash } = splitRoute(route)

  if (typeof window === 'undefined') {
    return portalSiteHref(route)
  }

  const top = window.top ?? window
  const topPath = top.location.pathname

  let resolved: string
  if (topPath.startsWith(`/portal/${PORTAL_SLUG}`)) {
    resolved = path ? `/portal/${PORTAL_SLUG}${path}` : `/portal/${PORTAL_SLUG}`
  } else if (top !== window && !topPath.startsWith('/custom-sites')) {
    resolved = path || '/'
  } else {
    resolved = `${SITE_BASE}${path || ''}`
  }

  return hash ? `${resolved}#${hash}` : resolved
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
