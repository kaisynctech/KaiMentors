import { notFound } from 'next/navigation'
import ArticleDetail from '@/components/articles/ArticleDetail'
import { getArticleBySlug, getStaticArticleSlugs } from '@/config/articles'

export function generateStaticParams() {
  return getStaticArticleSlugs().map((slug) => ({ slug }))
}

interface ArticlePageProps {
  params: Promise<{ slug: string }>
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) notFound()
  return <ArticleDetail article={article} />
}
