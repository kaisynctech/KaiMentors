'use client'

import { PortalAuthLink } from '@/components/portal-auth-link'

export function FooterPortalLinks() {
  return (
    <div className="flex flex-col gap-2">
      <PortalAuthLink
        kind="join"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign Up
      </PortalAuthLink>
      <PortalAuthLink
        kind="login"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Login
      </PortalAuthLink>
    </div>
  )
}
