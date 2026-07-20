'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { ArrowUpRight, BookOpen, GraduationCap, LineChart } from 'lucide-react'
import { PortalAuthLink } from '@/components/portal-auth-link'
import { SiteLink } from '@/components/site-link'
import { PARTNER_CODE } from '@/config/site'
import TradingViewTicker from '@/components/layout/TradingViewTicker'
import { assetUrl } from '@/lib/site-url'

const STATS = [
  { value: '8+',   label: 'Years Trading'      },
  { value: '500+', label: 'Traders Educated'  },
  { value: '15+',  label: 'Countries'         },
  { value: '100%', label: 'XM Deposit Bonus'  },
]

const EXPLORE = [
  {
    title: 'Who am I?',
    desc: 'The story behind Bandi Shares and our macro framework.',
    href: '/about',
    icon: GraduationCap,
  },
  {
    title: 'Programs',
    desc: 'Community, bootcamp, and full educational tiers.',
    href: '/services',
    icon: BookOpen,
  },
  {
    title: 'XM Partner',
    desc: `Open, verify, and copy trade with code ${PARTNER_CODE}.`,
    href: '/xm',
    icon: LineChart,
  },
  {
    title: 'Articles',
    desc: 'Market updates and macro insights — shareable reads.',
    href: '/articles',
    icon: ArrowUpRight,
  },
]

const COMMUNITY_PREVIEW = [
  { src: assetUrl('/assets/bandi-lecture.jpeg'), label: 'Live teaching' },
  { src: assetUrl('/assets/gallery-community.jpg'), label: 'Community wins' },
  { src: assetUrl('/assets/bandi-presentation.jpeg'), label: 'Strategy sessions' },
]

export default function HomePage() {
  return (
    <>
      {/* Hero — original wide classroom photo */}
      <section className="hero-section relative flex min-h-[85vh] items-center justify-center overflow-hidden pb-16 md:pb-20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${assetUrl('/assets/hero-bandi.jpeg')}')` }}
        />
        <div className="absolute inset-0 bg-[hsl(var(--midnight))]/78" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsla(155,70%,30%,0.06)] via-transparent to-[hsl(var(--midnight))]" />

        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-16 text-center md:pt-20">
          <motion.div
            initial={false}
            className="hero-glass mb-8 inline-flex items-center gap-2 rounded-xl border px-4 py-2"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-[hsl(215_16%_78%)]">
              Live Markets · Macro Intelligence
            </span>
          </motion.div>

          <motion.h1
            initial={false}
            className="hero-headline mb-5 text-balance text-3xl font-bold leading-[1.12] sm:text-4xl md:text-5xl lg:text-6xl"
          >
            Stop Guessing the Candle.{' '}
            <span className="gradient-text-emerald">Start Understanding the Flow.</span>
          </motion.h1>

          <motion.p
            initial={false}
            className="hero-subcopy mx-auto mb-8 max-w-2xl text-base leading-relaxed md:text-lg"
          >
            Macroeconomic logic for the individual trader — structure, data, and discipline.
          </motion.p>

          <motion.div
            initial={false}
            className="flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <PortalAuthLink
              kind="join"
              className="btn-primary-glow text-sm uppercase tracking-wide"
            >
              Sign Up
            </PortalAuthLink>
            <SiteLink
              href="/about"
              className="hero-ghost-btn rounded-lg border px-6 py-3 text-sm transition-all duration-300"
            >
              Who am I?
            </SiteLink>
          </motion.div>

          <motion.div
            initial={false}
            className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
          >
            {STATS.map((stat) => (
              <div key={stat.label} className="hero-stat-card rounded-xl border px-3 py-3 text-center md:p-4">
                <div className="gradient-text-emerald text-xl font-bold md:text-2xl">{stat.value}</div>
                <div className="hero-stat-label mt-1 text-[10px] uppercase tracking-wider md:text-xs">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <TradingViewTicker inline />

      {/* Quick explore — replaces long stacked sections */}
      <section className="section-padding pb-12 pt-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-2xl font-bold text-foreground md:text-3xl">
              Explore <span className="gradient-text-emerald">Bandi Shares</span>
            </h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground md:text-base">
              Everything you need — one click away.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXPLORE.map((item, i) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <SiteLink
                  href={item.href}
                  className="glass-card-hover group flex h-full flex-col p-6"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <item.icon className="text-primary" size={20} />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                  <span className="text-xs font-medium uppercase tracking-wider text-primary group-hover:underline">
                    Open →
                  </span>
                </SiteLink>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Light community preview — 3 images, not full gallery grid */}
      <section className="section-padding border-t border-[hsla(0,0%,100%,0.06)] pt-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-bold text-foreground md:text-3xl">
                Inside the <span className="gradient-text-emerald">Community</span>
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Real teaching, real traders — a quick glimpse.
              </p>
            </div>
            <SiteLink href="/about" className="btn-ghost-glass text-xs uppercase tracking-wide">
              Learn more
            </SiteLink>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {COMMUNITY_PREVIEW.map((item, i) => (
              <motion.div
                key={item.src}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl"
              >
                <Image
                  src={item.src}
                  alt={item.label}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className="absolute bottom-3 left-3 text-xs font-medium text-white">
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
