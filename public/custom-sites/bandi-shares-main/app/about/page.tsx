'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Target, BarChart3, Eye, Zap } from 'lucide-react'
import { assetUrl } from '@/lib/site-url'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const fadeUp = {
  hidden:  { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: 'easeOut' as const },
  }),
}

const FAQS = [
  {
    q: 'What is the Macro approach and how is it different?',
    a: 'Our Macro approach is rooted in fundamental economics, central bank policy, yield curves, CPI, GDP, and global capital flows. Unlike technical pattern-chasing, we read the economic data driving markets before the chart reacts. You learn to position with the same logic professional macro analysts use.',
  },
  {
    q: 'Why does the Educational Program run for 6 months?',
    a: "Macroeconomic mastery isn't a weekend skill. Six months gives us time to walk through full policy cycles, multiple data releases, and live regime shifts. You get structured curriculum, live cohort case studies, and the repetition required to internalize the framework, not just memorize it.",
  },
  {
    q: 'Are split-payment options available for the Bootcamp?',
    a: "Yes. The 7-Day Bootcamp Recordings (R1,540.00) can be arranged on a split-payment basis on request. Reach out via the Inner Circle community or our contact channels and we'll set up a payment plan that works for you.",
  },
  {
    q: 'Do I need an economics background to follow the material?',
    a: 'No. Our framework distills macroeconomic concepts, yield curves, central bank signals, regime identification, into clear, actionable lessons. If you can read a chart, you can learn to read the economy driving it.',
  },
  {
    q: 'Is this a signal service?',
    a: 'No. Bandi Shares is an educational platform. Trade Discussions provide context and rationale, not blind signals. The goal is to make you a self-sufficient macro trader, not a copy-trader.',
  },
  {
    q: 'What is the refund policy?',
    a: 'All sales of digital products and educational programs are final and non-refundable once access is granted. Monthly subscriptions can be cancelled at any time. We encourage you to engage with the Free Community first.',
  },
]

const VALUES = [
  {
    icon: Target,
    title: 'Macroeconomic Alignment',
    desc: "We don't chase retail setups. Every strategy is built on the data that actually moves markets — central bank policy, interest rate cycles, yield curves, and global capital flows.",
  },
  {
    icon: BarChart3,
    title: 'Fundamentals First',
    desc: 'We start with fundamental analysis of central bank policy and global capital flows, then zoom into precision entries. This top-down framework eliminates the guesswork that traps most retail traders.',
  },
  {
    icon: Eye,
    title: 'Radical Transparency',
    desc: 'Every trade is logged. Every loss is shared. We believe trust is built through honesty, not highlight reels. Our community sees the full picture.',
  },
  {
    icon: Zap,
    title: 'Execution Excellence',
    desc: 'Strategy without execution is just theory. We drill precision entries, risk management, and psychological discipline until it becomes second nature.',
  },
]

const NUMBERS = [
  { num: '2025',  label: 'Founded'         },
  { num: '500+', label: 'Traders Educated' },
  { num: '15+',   label: 'Countries'       },
  { num: '8+',    label: 'Years Trading Experience'        },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="section-padding flex min-h-[60vh] items-center">
        <div className="mx-auto max-w-5xl">
          <motion.div initial={false}>
            <span className="mb-4 block text-sm font-semibold uppercase tracking-widest text-primary">
              About Us
            </span>
          </motion.div>
          <motion.h1
            initial={false}
            className="mb-6 text-balance text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl md:text-6xl"
          >
            From Retail Noise to{' '}
            <span className="gradient-text-emerald">Macroeconomic Clarity</span>
          </motion.h1>
          <motion.p
            initial={false}
            className="max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-xl"
          >
            Bandi Shares FX was built on a simple premise: retail traders fail because they ignore
            the economic forces driving price. We bridge the gap by teaching a{' '}
            <span className="font-medium text-foreground">fundamentals-based</span> approach starting
            with analysis of central bank policy and global capital flows, then zooming
            into precise technical entries grounded in real data.
          </motion.p>
        </div>
      </section>

      {/* Story */}
      <section className="section-padding">
        <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="glass-card relative aspect-[4/5] overflow-hidden">
              <Image
                src={assetUrl('/assets/bandi-presentation.jpeg')}
                alt="Bandi presenting at a trading seminar"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="mb-6 text-3xl font-bold text-foreground">The Origin Story</h2>
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                After years of blowing accounts with retail strategies found on YouTube and forums,
                our founder made a pivotal shift studying how the global economy actually drives
                price. The turning point came from understanding that{' '}
                <span className="font-medium text-foreground">
                  fundamental analysis isn't optional, it's the foundation
                </span>
                .
              </p>
              <p>
                The realization was clear:{' '}
                <span className="font-medium text-foreground">price follows policy, not patterns.</span>{' '}
                Markets don't move on support and resistance the way most courses teach. They move on
                interest rate decisions, inflation prints, and macro data often weeks before the
                news cycle catches up.
              </p>
              <p>
                Bandi Shares was born to teach traders this{' '}
                <span className="font-medium text-foreground">fundamentals based</span> framework
                starting with interest rate cycles, yield curves, and COT data, then drilling down
                to precise technical entries. Not with hype or promises, but with data, discipline,
                and radical transparency.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Our <span className="gradient-text-emerald">Core Pillars</span>
            </h2>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-2">
            {VALUES.map((val, i) => (
              <motion.div
                key={val.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card-hover p-8"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <val.icon className="text-primary" size={22} />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-foreground">{val.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{val.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="section-padding">
        <div className="mx-auto max-w-4xl">
          <div className="glass-card grid grid-cols-2 gap-8 p-12 text-center md:grid-cols-4">
            {NUMBERS.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="gradient-text-emerald text-2xl font-bold md:text-3xl">{item.num}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Common Questions
            </span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              Frequently Asked <span className="gradient-text-emerald">Questions</span>
            </h2>
          </motion.div>

          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="glass-card border-[hsla(0,0%,100%,0.1)] px-6"
              >
                <AccordionTrigger className="py-5 text-left text-sm font-medium text-foreground hover:text-primary hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  )
}
