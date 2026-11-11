'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PORTAL_SLUG } from '@/config/site'

type Note = {
  id: string
  title: string
  yesterday: string
  today: string
  published_at: string | null
}

type GoldItem = {
  title: string
  url: string
  summary: string | null
}

type Payload = {
  articles: Note[]
  gold: {
    sourceUrl: string
    items: GoldItem[]
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function ArticlesPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [tab, setTab] = useState<'notes' | 'news'>('notes')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/public/market-articles?portal=${PORTAL_SLUG}`)
      .then((response) => response.json())
      .then((data: Payload) => {
        if (!cancelled) setPayload(data)
      })
      .catch(() => {
        if (!cancelled) setPayload({ articles: [], gold: { sourceUrl: 'https://www.fxstreet.com/news/feed', items: [] } })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const articles = payload?.articles ?? []
  const gold = payload?.gold

  return (
    <>
      <section className="section-padding flex min-h-[40vh] items-center">
        <div className="mx-auto max-w-5xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 block text-xs font-semibold uppercase tracking-[0.25em] text-primary"
          >
            Market intelligence
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 text-balance text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl md:text-6xl"
          >
            Articles &amp;{' '}
            <span className="gradient-text-emerald">insights</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-muted-foreground"
          >
            Bandile's morning notes, and a News tab for what FXStreet is reporting on gold.
          </motion.p>
        </div>
      </section>

      <section className="section-padding pt-0">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex gap-6 border-b border-foreground/10" role="tablist" aria-label="Articles">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'notes'}
              onClick={() => setTab('notes')}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${tab === 'notes' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
            >
              Bandile&apos;s notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'news'}
              onClick={() => setTab('news')}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${tab === 'news' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
            >
              News
            </button>
          </div>

          {tab === 'news' ? (
            <div className="glass-card p-6 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">FXStreet</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">What FXStreet is reporting</h2>
              {gold && gold.items.length > 0 ? (
                <ul className="mt-4 grid gap-3">
                  {gold.items.map((item) => (
                    <li key={item.url}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                        {item.title}
                      </a>
                      {item.summary ? <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  FXStreet did not return a gold update just now. Their coverage is still one click away.
                </p>
              )}
              <a
                className="mt-4 inline-block text-sm font-medium text-primary"
                href={gold?.sourceUrl ?? 'https://www.fxstreet.com/news/feed'}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read gold coverage on FXStreet →
              </a>
            </div>
          ) : articles.length === 0 ? (
            <div className="glass-card px-8 py-16 text-center">
              <h2 className="mb-3 text-xl font-semibold text-foreground">The first morning note is on its way</h2>
              <p className="text-sm text-muted-foreground">
                Bandile posts what happened yesterday and what he is watching today.
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {articles.map((article) => (
                <article key={article.id} className="glass-card p-6 md:p-8">
                  {article.published_at ? (
                    <time dateTime={article.published_at} className="text-xs uppercase tracking-wider text-muted-foreground">
                      {formatDate(article.published_at)}
                    </time>
                  ) : null}
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{article.title}</h2>
                  <h3 className="mt-4 text-sm font-semibold text-primary">Yesterday</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{article.yesterday}</p>
                  <h3 className="mt-4 text-sm font-semibold text-primary">Today</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{article.today}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
