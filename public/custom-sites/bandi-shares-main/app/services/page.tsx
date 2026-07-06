'use client'

import { motion } from 'framer-motion'
import { BookOpen, LineChart, Zap, BookMarked, Sparkles } from 'lucide-react'
import { EXTERNAL_LINKS } from '@/config/links'

const SERVICES = [
  {
    icon: BookOpen,
    tag: '6-Month Educational Program',
    title: "The Economist's Playbook: A 6-Month Transformation",
    price: 'R6,000.00',
    priceMeta: 'One-time enrolment',
    desc: 'Master the macroeconomic framework used to position ahead of global shifts.',
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
    desc: "Signals rooted in economic reality. We track GDP, CPI, and FOMC so you don't have to.",
    cta: 'Enter the War Room',
    href: EXTERNAL_LINKS.tradeDiscussions,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: Zap,
    tag: '7-Day Bootcamp Recordings',
    title: 'The Macro Intensive',
    price: 'R1,540.00',
    priceMeta: 'One-time access',
    desc: 'A deep-dive into Regime Identification and liquidity conditions.',
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
    desc: 'The structured guide to reading the economy before the chart reacts.',
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
    desc: 'Your first step into professional macro trading. Risk less, profit more.',
    cta: 'Enter the War Room',
    href: EXTERNAL_LINKS.overallBusiness,
    span: 'md:col-span-1',
    featured: false,
  },
]

export default function ServicesPage() {
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
            Five Pillars of{' '}
            <span className="gradient-text-emerald">Macroeconomic Edge</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-muted-foreground"
          >
            Built like a research desk. Delivered like a graduate seminar. Priced for the operator.
          </motion.p>
        </div>
      </section>

      {/* Services grid */}
      <section className="section-padding pt-0">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {SERVICES.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: 'easeOut' }}
              className={`glass-card-hover group flex flex-col p-7 md:p-8 ${s.span} ${
                s.featured ? 'ring-1 ring-primary/30' : ''
              }`}
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                  <s.icon className="text-primary" size={20} />
                </div>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  {s.tag}
                </span>
              </div>

              <h3 className="mb-4 text-balance text-xl font-bold leading-snug text-foreground md:text-2xl">
                {s.title}
              </h3>
              <p className="mb-6 flex-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>

              <div className="mb-6 flex items-baseline gap-2 border-l-2 border-primary pl-3">
                <span className="font-mono text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {s.price}
                </span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {s.priceMeta}
                </span>
              </div>

              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full rounded-lg py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-300 ${
                  s.featured ? 'btn-primary-glow' : 'btn-ghost-glass'
                }`}
              >
                {s.cta}
              </a>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Closing quote */}
      <section className="section-padding">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-10"
          >
            <p className="font-mono text-sm italic leading-relaxed text-muted-foreground">
              Trading is an economic science. Results require discipline. No magic patterns here,
              just data.
            </p>
          </motion.div>
        </div>
      </section>
    </>
  )
}
