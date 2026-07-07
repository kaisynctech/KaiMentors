import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Programs & Pricing',
  description:
    'Bandi Shares educational programs and pricing. XM-verified members unlock discounted rates on macro forex courses and community access.',
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
