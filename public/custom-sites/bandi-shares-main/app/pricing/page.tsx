'use client'

import { motion } from 'framer-motion'
import { SiteLink } from '@/components/site-link'
import { CheckCircle2, BookOpen, LineChart, Zap, BookMarked, Sparkles } from 'lucide-react'
import { EXTERNAL_LINKS } from '@/config/links'

const TIERS = [
  {
    icon: BookOpen,
    tag: '6-Month Educational Program',
    title: "The Economist's Playbook: A 6-Month Transformation",
    price: 'R6,000.00',
    priceMeta: 'One-time enrolment',
    sub: 'Move beyond retail strategies. Master the macroeconomic framework used to position ahead of global shifts.',
    body: "This isn't theory. It's an operational system for reading Yield Curves, Central Bank signals, and Global Risk shifts. By the end, you won't just see a chart — you'll see the policy driving it.",
    features: [
      '26 weeks of structured macro curriculum',
      'Yield Curve & Central Bank signal modules',
      'Live cohort case studies',
      'Lifetime access to recordings',
    ],
    cta: 'Claim Your Edge',
    href: EXTERNAL_LINKS.education6Months,
    span: 'md:col-span-2',
    featured: true,
  },
  {
    icon: LineChart,
    tag: 'Trade Discussions',
    title: 'Macro-Driven Alpha',
    price: 'R1,000.00',
    priceMeta: '/ month',
    sub: "Signals rooted in economic reality, not lagging indicators.",
    body: "We track the pulse of global GDP, CPI, and FOMC so you don't have to. You get the entry, the exit, and most importantly, the Why.",
    features: [
      'Macro-anchored trade ideas',
      'GDP, CPI & FOMC briefings',
      'Entry, exit & rationale',
      'Cancel anytime',
    ],
    cta: 'Enter the War Room',
    href: EXTERNAL_LINKS.tradeDiscussions,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: Zap,
    tag: '7-Day Bootcamp Recordings',
    title: 'The Macro Intensive: 7 Days to Market Mastery',
    price: 'R1,540.00',
    priceMeta: 'One-time access',
    sub: 'A deep-dive for busy traders into the mechanics of price.',
    body: 'From Liquidity Conditions to Regime Identification, we compress years of macro research into a 7-day blueprint.',
    features: [
      '7 full-length intensive sessions',
      'Liquidity & regime frameworks',
      'Watch on your own schedule',
      'Workbook & references included',
    ],
    cta: 'Claim Your Edge',
    href: EXTERNAL_LINKS.bootcamp,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: BookMarked,
    tag: 'The Book',
    title: 'The Gospel of Fundamental Analysis',
    price: 'R2,500.00',
    priceMeta: 'Lifetime updates',
    sub: 'The structured guide to reading the economy before the chart reacts.',
    body: 'Stop chasing shadows. This book is the bridge for traders who have rejected technical dogma and are ready to treat trading like the economic science it actually is.',
    features: [
      'Full digital edition',
      'Lifetime revision updates',
      'Annotated economic case studies',
      'Companion glossary',
    ],
    cta: 'See the Mechanics',
    href: EXTERNAL_LINKS.book,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: Sparkles,
    tag: 'The Free Community',
    title: 'The Inner Circle',
    price: 'Free',
    priceMeta: 'Access',
    sub: 'Your first step into the world of professional macro trading.',
    body: 'Risk less, profit more, and grow with a community of high-conviction traders. Get an exclusive preview of the Bandi Shares framework and start protecting your capital today.',
    features: [
      'Open access to community channels',
      'Weekly macro previews',
      'Foundational learning resources',
      'No commitment required',
    ],
    cta: 'Enter the War Room',
    href: EXTERNAL_LINKS.overallBusiness,
    span: 'md:col-span-1',
    featured: false,
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="section-padding flex min-h-[40vh] items-center">
        <div className="mx-auto max-w-5xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 block text-xs font-semibold uppercase tracking-[0.25em] text-primary"
          >
            The Arsenal
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 text-balance text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl md:text-6xl"
          >
            Invest in Your{' '}
            <span className="gradient-text-emerald">Macroeconomic Edge</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-muted-foreground"
          >
            Five tiers. One framework. Choose the depth of access that matches your conviction.
          </motion.p>
        </div>
      </section>

      {/* Pricing grid */}
      <section className="section-padding pt-0">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: 'easeOut' }}
              className={`glass-card-hover group flex flex-col p-7 md:p-8 ${tier.span} ${
                tier.featured ? 'ring-1 ring-primary/30' : ''
              }`}
            >
              {/* Icon + tag */}
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                  <tier.icon className="text-primary" size={20} />
                </div>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  {tier.tag}
                </span>
              </div>

              <h3 className="mb-3 text-balance text-xl font-bold leading-snug text-foreground md:text-2xl">
                {tier.title}
              </h3>
              <p className="mb-3 text-sm font-medium leading-relaxed text-foreground/80">
                {tier.sub}
              </p>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{tier.body}</p>

              {/* Price */}
              <div className="mb-6 flex items-baseline gap-2 border-l-2 border-primary pl-3">
                <span className="font-mono text-3xl font-bold tracking-tight text-foreground">
                  {tier.price}
                </span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {tier.priceMeta}
                </span>
              </div>

              {/* Features */}
              <div className="mb-8 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={14} />
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>

              <a
                href={tier.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full rounded-lg py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-300 ${
                  tier.featured ? 'btn-primary-glow' : 'btn-ghost-glass'
                }`}
              >
                {tier.cta}
              </a>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Commitment */}
      <section className="section-padding">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-10"
          >
            <h3 className="mb-3 text-xl font-bold text-foreground">Our Commitment to You</h3>
            <p className="mx-auto mb-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              We don't promise overnight riches — we promise a proven framework, relentless support,
              and a community that holds you to a higher standard. Your success is our reputation.
            </p>
            <p className="mx-auto max-w-xl text-xs leading-relaxed text-muted-foreground">
              All sales of digital products (Book/Course) are final and non-refundable once access is
              granted. See our{' '}
              <SiteLink href="/refund-policy" className="text-primary hover:underline">
                Refund Policy
              </SiteLink>{' '}
              and{' '}
              <SiteLink href="/terms" className="text-primary hover:underline">
                Terms of Service
              </SiteLink>{' '}
              for details.
            </p>
          </motion.div>
        </div>
      </section>
    </>
  )
}
