import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '404 — Page Not Found',
}

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">404</p>
      <h1 className="mb-4 text-4xl font-bold text-foreground">Page Not Found</h1>
      <p className="mb-8 max-w-sm text-muted-foreground">
        The route you're looking for doesn't exist. Check the URL or head back to the dashboard.
      </p>
      <Link href="/" className="btn-primary-glow text-sm uppercase tracking-wide">
        Return to Home
      </Link>
    </div>
  )
}
