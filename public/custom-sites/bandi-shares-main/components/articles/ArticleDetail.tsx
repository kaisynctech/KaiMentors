'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import type { Article } from '@/config/articles'
import ArticleShareButtons from '@/components/articles/ArticleShareButtons'
import { SiteLink } from '@/components/site-link'
import { assetUrl } from '@/lib/site-url'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function ArticleDetail({ article }: { article: Article }) {
  return (
    <>
      <section className="section-padding">
        <div className="mx-auto max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <SiteLink
              href="/articles"
              className="mb-8 inline-block text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              ← All articles
            </SiteLink>
            <time
              dateTime={article.publishedAt}
              className="block text-xs uppercase tracking-wider text-muted-foreground"
            >
              {formatDate(article.publishedAt)}
            </time>
            <h1 className="mt-3 text-balance text-3xl font-bold leading-tight text-foreground md:text-4xl">
              {article.title}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">{article.excerpt}</p>
          </motion.div>

          {article.coverImage ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative mt-10 aspect-[16/9] overflow-hidden rounded-2xl"
            >
              <Image
                src={assetUrl(article.coverImage)}
                alt=""
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, 768px"
              />
            </motion.div>
          ) : null}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="article-body mt-10 max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: article.body }}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card mt-12 p-6"
          >
            <ArticleShareButtons title={article.title} slug={article.slug} />
          </motion.div>
        </div>
      </section>
    </>
  )
}
