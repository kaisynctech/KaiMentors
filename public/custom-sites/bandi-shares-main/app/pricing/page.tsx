'use client'

import { useEffect } from 'react'
import { portalSiteHref } from '@/lib/site-url'

export default function PricingRedirectPage() {
  useEffect(() => {
    const target = portalSiteHref('/services')
    const top = window.top ?? window
    top.location.href = target
  }, [])

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 text-center">
      <p className="text-muted-foreground">Redirecting to programs &amp; pricing…</p>
    </div>
  )
}
