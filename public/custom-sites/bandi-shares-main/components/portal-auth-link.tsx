'use client'

import { useEffect, useState } from 'react'
import { PORTAL_SLUG } from '@/config/site'

type PortalAuthKind = 'join' | 'login'

function resolvePortalLinks() {
  if (typeof window === 'undefined') {
    return { join: '/join-academy', login: '/login' }
  }

  const topWindow = window.top ?? window
  const path = topWindow.location.pathname
  const onPlatformPortal =
    path === `/portal/${PORTAL_SLUG}` ||
    path.startsWith(`/portal/${PORTAL_SLUG}/`)

  if (onPlatformPortal) {
    return {
      join: `/portal/${PORTAL_SLUG}/join-academy`,
      login: `/portal/${PORTAL_SLUG}/login`,
    }
  }

  return { join: '/join-academy', login: '/login' }
}

interface PortalAuthLinkProps {
  kind: PortalAuthKind
  className?: string
  children: React.ReactNode
}

export function PortalAuthLink({ kind, className, children }: PortalAuthLinkProps) {
  const [href, setHref] = useState(kind === 'join' ? '/join-academy' : '/login')

  useEffect(() => {
    setHref(resolvePortalLinks()[kind])
  }, [kind])

  return (
    <a href={href} target="_top" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}

export function usePortalLinks() {
  const [links, setLinks] = useState({ join: '/join-academy', login: '/login' })

  useEffect(() => {
    setLinks(resolvePortalLinks())
  }, [])

  return links
}
