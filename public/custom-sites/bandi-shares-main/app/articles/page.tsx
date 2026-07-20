'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { FileText } from 'lucide-react'
import { getPublishedArticles } from '@/config/articles'
import { SiteLink } from '@/components/site-link'
import { assetUrl } from '@/lib/site-url'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function ArticlesPage() {
  const articles = getPublishedArticles()

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
            Macro views, market updates, and educational notes from Bandi Shares — written to
            share, not to hype.
          </motion.p>
        </div>
      </section>

      <section className="section-padding pt-0">
        <div className="mx-auto max-w-4xl">
          {articles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card flex flex-col items-center px-8 py-16 text-center"
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <FileText className="text-primary" size={28} />
              </div>
              <h2 className="mb-3 text-xl font-semibold text-foreground">Articles coming soon</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Bandile is preparing the first market updates and macro insights. Check back here
                — each article will be shareable when it goes live.
              </p>
              <SiteLink href="/" className="btn-ghost-glass mt-8 text-sm">
                Back to home
              </SiteLink>
            </motion.div>
          ) : (
            <div className="grid gap-6">
              {articles.map((article, i) => (
                <motion.article
                  key={article.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card-hover overflow-hidden"
                >
                  <SiteLink href={`/articles/${article.slug}`} className="block p-6 md:p-8">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center">
                      {article.coverImage ? (
                        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl md:w-48">
                          <Image
                            src={assetUrl(article.coverImage)}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="192px"
                          />
                        </div>
                      ) : null}
                      <div>
                        <time
                          dateTime={article.publishedAt}
                          className="text-xs uppercase tracking-wider text-muted-foreground"
                        >
                          {formatDate(article.publishedAt)}
                        </time>
                        <h2 className="mt-2 text-xl font-semibold text-foreground">
                          {article.title}
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {article.excerpt}
                        </p>
                        <span className="mt-4 inline-block text-sm font-medium text-primary">
                          Read article →
                        </span>
                      </div>
                    </div>
                  </SiteLink>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
