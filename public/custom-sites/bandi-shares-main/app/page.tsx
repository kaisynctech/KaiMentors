'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Globe2, Shield, Users } from 'lucide-react'
import { PortalAuthLink } from '@/components/portal-auth-link'
import { SiteLink } from '@/components/site-link'
import { PARTNER_CODE } from '@/config/site'
import HomeProgramsPreview from '@/components/home/HomeProgramsPreview'
import TradingViewTicker from '@/components/layout/TradingViewTicker'
import { assetUrl } from '@/lib/site-url'

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
    desc: 'We trade the data driving global markets — central bank policy, yield curves, and shifting fundamentals.',
  },
  {
    icon: Shield,
    title: 'Risk-First Approach',
    desc: 'Capital preservation is non-negotiable. Every trade is calculated with precise risk management.',
  },
  {
    icon: Users,
    title: 'Elite Community',
    desc: 'A curated network of serious traders. No noise, no hype — focused individuals committed to mastery.',
  },
]

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
      {/* Hero — split layout: copy + Bandile portrait (no cropped full-bleed photo) */}
      <section className="hero-section relative overflow-hidden">
        <div className="absolute inset-0 bg-[hsl(var(--midnight))]" />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.12]"
          style={{
            backgroundImage: `url('${assetUrl('/assets/hero-bandi.jpeg')}')`,
            backgroundPosition: 'center 40%',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--midnight))] via-[hsl(var(--midnight))]/95 to-[hsla(155,70%,30%,0.08)]" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 md:py-20 lg:grid-cols-[1.05fr,0.95fr] lg:gap-16 lg:py-24">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={false}
              className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap lg:items-start lg:justify-start"
            >
              <div className="hero-glass inline-flex items-center gap-2 rounded-xl border px-4 py-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-xs font-medium uppercase tracking-widest text-[hsl(215_16%_78%)]">
                  Live Markets · Macro Intelligence
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
                  Official XM partner ·{' '}
                  <b className="font-mono text-white">{PARTNER_CODE}</b>
                </span>
              </div>
            </motion.div>

            <motion.h1
              initial={false}
              className="hero-headline mb-5 text-balance text-3xl font-bold leading-[1.12] sm:text-4xl md:text-5xl"
            >
              Stop Guessing the Candle.{' '}
              <span className="gradient-text-emerald">Start Understanding the Flow.</span>
            </motion.h1>

            <motion.p
              initial={false}
              className="hero-subcopy mx-auto mb-8 max-w-xl text-base leading-relaxed md:text-lg lg:mx-0"
            >
              The market has a language. Bandi Shares teaches macroeconomic logic for the
              individual trader — structure, data, and discipline.
            </motion.p>

            <motion.div
              initial={false}
              className="flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
            >
              <PortalAuthLink
                kind="join"
                className="btn-primary-glow text-sm uppercase tracking-wide"
              >
                Sign Up
              </PortalAuthLink>
              <SiteLink
                href="/xm"
                className="hero-ghost-btn rounded-lg border px-6 py-3 text-sm transition-all duration-300"
              >
                Open XM Account
              </SiteLink>
            </motion.div>

            <motion.div
              initial={false}
              className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-xl"
            >
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="hero-stat-card rounded-xl border px-3 py-3 text-center lg:text-left"
                >
                  <div className="gradient-text-emerald text-xl font-bold md:text-2xl">
                    {stat.value}
                  </div>
                  <div className="hero-stat-label mt-1 text-[10px] uppercase tracking-wider md:text-xs">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Portrait — framed, not cropped as page background */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="relative mx-auto w-full max-w-md lg:max-w-none"
          >
            <div className="hero-glass relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-2xl">
              <Image
                src={assetUrl('/assets/bandile-hero.png')}
                alt="Bandile — founder of Bandi Shares"
                fill
                priority
                className="object-cover object-[center_15%]"
                sizes="(max-width: 1024px) 90vw, 480px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  Bandi Shares FX
                </p>
                <p className="mt-1 text-lg font-semibold text-white">Bandile</p>
                <p className="text-sm text-white/75">Macro educator · XM partner</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <TradingViewTicker inline />

      {/* Who am I — on the homepage, with room for the full story on About */}
      <section className="section-padding border-b border-[hsla(0,0%,100%,0.06)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[minmax(0,240px),1fr] lg:gap-14">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative mx-auto aspect-[3/4] w-full max-w-[240px] overflow-hidden rounded-2xl"
          >
            <Image
              src={assetUrl('/assets/bandile-portrait.png')}
              alt="Bandile — graduation portrait"
              fill
              className="object-cover object-top"
              sizes="240px"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Who am I?
            </span>
            <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
              From retail noise to{' '}
              <span className="gradient-text-emerald">macroeconomic clarity.</span>
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground md:text-base">
              Bandi Shares FX was built on a simple premise: retail traders fail when they ignore
              the economic forces driving price. We teach a fundamentals-based approach — central
              bank policy, global capital flows, and precise technical entries grounded in real data.
            </p>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground md:text-base">
              Official <b className="text-foreground">XM Global partner</b>. Use code{' '}
              <b className="font-mono text-primary">{PARTNER_CODE}</b> when you open your account,
              then verify inside the portal for member access.
            </p>
            <div className="flex flex-wrap gap-3">
              <SiteLink href="/about" className="btn-primary-glow text-sm uppercase tracking-wide">
                Read my full story
              </SiteLink>
              <SiteLink href="/articles" className="btn-ghost-glass text-sm">
                Articles &amp; insights
              </SiteLink>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why Bandi Shares */}
      <section className="section-padding">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
              Why <span className="gradient-text-emerald">Bandi Shares</span>?
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Macro intelligence, risk discipline, and a community that refuses hype.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {WHY_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
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

      {/* Community gallery */}
      <section className="section-padding border-t border-[hsla(0,0%,100%,0.06)]">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
              Inside the <span className="gradient-text-emerald">Community</span>
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Real setups, real results, real traders — a glimpse into our world.
            </p>
          </div>
          <div className="grid auto-rows-[160px] grid-cols-2 gap-4 md:auto-rows-[200px] md:grid-cols-4">
            {GALLERY.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className={`group relative overflow-hidden rounded-xl ${item.span}`}
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
    </>
  )
}
