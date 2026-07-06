/**
 * proxy.ts — Next.js 16 Network Proxy
 *
 * Replaces middleware.ts. Runs at the network/edge boundary before the
 * request reaches the Next.js server. Use this for redirects, rewrites,
 * authentication guards, and geo-based routing.
 *
 * Named export is `proxy` (not `middleware`).
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /apply is an alias for /verify — redirect at the network layer.
  if (pathname === '/apply') {
    return NextResponse.redirect(new URL('/verify', request.url))
  }

  // Default: pass through unchanged.
  return NextResponse.next()
}

export const config = {
  // Only run this proxy on routes that need inspection.
  // Excludes _next/static, _next/image, favicon.ico, etc.
  matcher: [
    '/apply',
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
