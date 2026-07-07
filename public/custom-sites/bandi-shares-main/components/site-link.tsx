'use client'

import { useEffect, useState } from 'react'
import { resolveSiteHref, portalSiteHref } from '@/lib/site-url'

interface SiteLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
}

export function SiteLink({ href, children, className, ...rest }: SiteLinkProps) {
  const [resolved, setResolved] = useState(() => portalSiteHref(href))

  useEffect(() => {
    setResolved(resolveSiteHref(href))
  }, [href])

  return (
    <a
      href={resolved}
      className={className}
      target="_top"
      rel="noopener noreferrer"
      {...rest}
    >
      {children}
    </a>
  )
}
