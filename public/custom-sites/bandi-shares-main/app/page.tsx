'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Globe2, Shield, Users, ChevronDown } from 'lucide-react'
import { EXTERNAL_LINKS } from '@/config/links'
import { PortalAuthLink } from '@/components/portal-auth-link'
import { SiteLink } from '@/components/site-link'
import { PARTNER_CODE } from '@/config/site'
import HomeProgramsPreview from '@/components/home/HomeProgramsPreview'
import HomeXmDiscount from '@/components/home/HomeXmDiscount'
import TradingViewTicker from '@/components/layout/TradingViewTicker'
import { assetUrl } from '@/lib/site-url'

const fadeUp = {
  hidden:  { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: 'easeOut' as const },
  }),
}

const STATS = [
  { value: '8+',   label: 'Years Trading'      },
  { value: '500+', label: 'Traders Educated'  },
  { value: '15+',  label: 'Countries'         },
  { value: '100%', label: 'XM Deposit Bonus'  },
]

const WHY_CARDS = [
  {
    icon: Globe2,
    title: 'Macroeconomic Alignment',
    desc: "We don't guess based on lagging chart patterns. We trade the raw data driving global markets — our edge is built on understanding central bank policy, yield curves, and shifting macroeconomic fundamentals.",
  },
  {
    icon: Shield,
    title: 'Risk-First Approach',
    desc: 'Capital preservation is non-negotiable. Every trade is calculated with precise risk management and position sizing.',
  },
  {
    icon: Users,
    title: 'Elite Community',
    desc: 'Join a curated network of serious traders. No noise, no hype, just focused individuals committed to mastery.',
  },
]

// Gallery items — place images in public/assets/ and update src paths.
const GALLERY = [
  { src: assetUrl('/assets/bandi-lecture.jpeg'),       span: 'col-span-2 row-span-2', label: 'Live Seminar'       },
  { src: assetUrl('/assets/gallery-seminar-1.jpg'),    span: 'col-span-1 row-span-1', label: 'Audience Engagement' },
  { src: assetUrl('/assets/gallery-charts.jpg'),       span: 'col-span-1 row-span-1', label: 'Chart Analysis'      },
  { src: assetUrl('/assets/bandi-presentation.jpeg'),  span: 'col-span-1 row-span-1', label: 'Strategy Breakdown'  },
  { src: assetUrl('/assets/gallery-community.jpg'),    span: 'col-span-2 row-span-1', label: 'Community Wins'      },
  { src: assetUrl('/assets/gallery-mentorship.jpg'),   span: 'col-span-1 row-span-1', label: '1-on-1 Mentorship'   },
]

export default function HomePage() {
  return (
    <>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <section className="hero-section relative flex min-h-[90vh] items-center justify-center overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url('${assetUrl('/assets/hero-bandi.jpeg')}')` }}
        />
        {/* Overlays — dark scrim; bottom fades to midnight (not page bg) to avoid cloudy wash */}
        <div className="absolute inset-0 bg-[hsl(var(--midnight))]/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsla(155,70%,30%,0.08)] via-transparent to-[hsl(var(--midnight))]" />

        <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
          {/* Eyebrow pills */}
          <motion.div
            initial={false}
            className="mb-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <div className="hero-glass inline-flex items-center gap-2 rounded-xl border px-4 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-xs font-medium uppercase tracking-widest text-[hsl(215_16%_78%)]">
                Live Markets • Macro Intelligence
              </span>
            </div>
            <div className="hero-glass inline-flex items-center gap-2.5 rounded-xl border px-4 py-2">
              <Image
                src={assetUrl('/assets/xm-logo.png')}
                alt="XM"
                width={56}
                height={24}
                className="h-5 w-auto object-contain"
              />
              <span className="text-xs font-medium uppercase tracking-widest text-[hsl(215_16%_78%)]">
                Official XM partner · <b className="font-mono text-white">{PARTNER_CODE}</b>
              </span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={false}
            className="hero-headline mb-6 text-balance text-4xl font-bold leading-[1.1] sm:text-5xl md:text-7xl"
          >
            Stop Guessing the Candle.{' '}
            <span className="gradient-text-emerald">Start Understanding the Flow.</span>
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={false}
            className="hero-subcopy mx-auto mb-10 max-w-2xl text-lg leading-relaxed md:text-xl"
          >
            The Market has a Language. We Teach You to Speak It. Macroeconomic logic for
            the individual trader.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={false}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <PortalAuthLink
              kind="join"
              className="btn-primary-glow text-sm uppercase tracking-wide"
            >
              Sign Up
            </PortalAuthLink>
            <a
              href={EXTERNAL_LINKS.overallBusiness}
              target="_blank" rel="noopener noreferrer"
              className="hero-ghost-btn rounded-lg border px-6 py-3 text-sm uppercase tracking-wide transition-all duration-300"
            >
              Claim Your Edge
            </a>
            <SiteLink
              href="/about"
              className="hero-ghost-btn rounded-lg border px-6 py-3 text-sm transition-all duration-300"
            >
              See the Mechanics
            </SiteLink>
          </motion.div>

          {/* Stats grid */}
          <motion.div
            initial={false}
            className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4"
          >
            {STATS.map((stat) => (
              <div key={stat.label} className="hero-stat-card rounded-xl border p-4 text-center">
                <div className="gradient-text-emerald text-2xl font-bold md:text-3xl">
                  {stat.value}
                </div>
                <div className="hero-stat-label mt-1 text-xs uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="text-[hsl(215_16%_78%)]" size={24} />
        </motion.div>
      </section>

      {/* Live markets — full-width strip above community */}
      <TradingViewTicker inline />

      {/* ─── Gallery ───────────────────────────────────────────── */}
      <section className="section-padding">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Inside the <span className="gradient-text-emerald">Community</span>
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Real setups, real results, real traders. A glimpse into our world.
            </p>
          </motion.div>

          <div className="grid auto-rows-[180px] grid-cols-2 gap-4 md:auto-rows-[220px] md:grid-cols-4">
            {GALLERY.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`group relative cursor-pointer overflow-hidden rounded-xl ${item.span}`}
              >
                <Image
                  src={item.src}
                  alt={item.label}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="absolute bottom-3 left-3 text-xs font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {item.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Bandi Shares ──────────────────────────────────── */}
      <section className="section-padding">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Why <span className="gradient-text-emerald">Bandi Shares</span>?
            </h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {WHY_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card-hover p-8"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <card.icon className="text-primary" size={22} />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-foreground">{card.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <HomeProgramsPreview />
      <HomeXmDiscount />

      {/* ─── CTA ───────────────────────────────────────────────── */}
      <section className="section-padding">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card relative overflow-hidden p-12 md:p-16"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <div className="relative z-10">
              <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
                Ready to Trade with an Edge?
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Stop guessing. Start trading the data. Your journey to consistent profitability
                begins here.
              </p>
              <a
                href={EXTERNAL_LINKS.overallBusiness}
                target="_blank" rel="noopener noreferrer"
                className="btn-primary-glow animate-pulse-glow text-sm uppercase tracking-wide"
              >
                Claim Your Edge
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
