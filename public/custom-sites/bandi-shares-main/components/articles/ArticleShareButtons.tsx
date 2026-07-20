'use client'

import { useCallback, useState } from 'react'
import { Check, Link2, Share2 } from 'lucide-react'

interface ArticleShareButtonsProps {
  title: string
  slug: string
}

function buildShareUrl(slug: string) {
  if (typeof window === 'undefined') return ''
  const base = window.location.origin
  const path = `/articles/${slug}`.replace(/\/+/g, '/')
  return `${base}${path}`
}

export default function ArticleShareButtons({ title, slug }: ArticleShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const shareUrl = useCallback(() => buildShareUrl(slug), [slug])

  const handleCopy = async () => {
    const url = shareUrl()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const handleNativeShare = async () => {
    const url = shareUrl()
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        /* fall through to copy */
      }
    }
    await handleCopy()
  }

  const encoded = encodeURIComponent
  const url = typeof window !== 'undefined' ? shareUrl() : ''

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Share
      </span>
      <button
        type="button"
        onClick={handleNativeShare}
        className="btn-ghost-glass inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all"
      >
        <Share2 size={16} />
        Share
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="btn-ghost-glass inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all"
      >
        {copied ? <Check size={16} /> : <Link2 size={16} />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {url ? (
        <>
          <a
            href={`https://wa.me/?text=${encoded(`${title} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[hsla(0,0%,100%,0.12)] px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            WhatsApp
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encoded(title)}&url=${encoded(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[hsla(0,0%,100%,0.12)] px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            X
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[hsla(0,0%,100%,0.12)] px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            LinkedIn
          </a>
        </>
      ) : null}
    </div>
  )
}
