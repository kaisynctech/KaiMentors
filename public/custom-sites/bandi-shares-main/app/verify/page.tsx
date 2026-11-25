'use client'

import { useEffect } from 'react'
import { resolveSiteHref } from '@/lib/site-url'

export default function VerifyRedirectPage() {
  useEffect(() => {
    const target = resolveSiteHref('/xm#verify')
    const top = window.top ?? window
    top.location.href = target
  }, [])

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 text-center">
      <p className="text-muted-foreground">Redirecting to XM verification…</p>
    </div>
  )
}
