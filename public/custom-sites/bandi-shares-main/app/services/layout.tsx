import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Programs & Pricing',
  description:
    'Bandi Shares educational programs and pricing. Sign in to the student portal after XM verification for discounted member checkout links.',
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
