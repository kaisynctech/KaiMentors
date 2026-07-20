export interface Article {
  slug: string
  title: string
  excerpt: string
  /** HTML paragraphs allowed — keep simple for static export. */
  body: string
  publishedAt: string
  coverImage?: string
}

/** Satisfies static export when the list is empty — never shown publicly. */
const STATIC_EXPORT_PLACEHOLDER_SLUG = '__static_export__'

/** Published articles — add entries here, then rebuild export. */
export const ARTICLES: Article[] = []

export function getPublishedArticles() {
  return [...ARTICLES].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )
}

/** Slugs pre-rendered at build time (includes placeholder when empty). */
export function getStaticArticleSlugs() {
  const slugs = ARTICLES.map((article) => article.slug)
  if (slugs.length === 0) return [STATIC_EXPORT_PLACEHOLDER_SLUG]
  return slugs
}

export function getArticleBySlug(slug: string) {
  if (slug === STATIC_EXPORT_PLACEHOLDER_SLUG) return null
  return ARTICLES.find((article) => article.slug === slug) ?? null
}
