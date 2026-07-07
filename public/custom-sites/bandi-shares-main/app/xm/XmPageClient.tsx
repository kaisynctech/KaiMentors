'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import {
  Smartphone,
  TrendingUp,
  Trophy,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { PARTNER_CODE, XM_LINKS } from '@/config/site'
import { PortalAuthLink } from '@/components/portal-auth-link'
import { SiteLink } from '@/components/site-link'
import { assetUrl } from '@/lib/site-url'
import XmVerifyForm from '@/components/xm/XmVerifyForm'
import { xmMemberDiscountLabel } from '@/config/site'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: 'easeOut' as const },
  }),
}

const STAT_WALL = [
  { value: '13.5B+', label: 'Trades executed on XM platforms worldwide' },
  { value: 'Zero', label: 'Rejections or requotes on trades' },
  { value: '92.9%', label: 'Of withdrawals automatically approved' },
]

const PILLARS = [
  {
    icon: Smartphone,
    title: 'XM App',
    desc: 'Full platform access on iOS and Android — chart, execute and manage your account anywhere.',
  },
  {
    icon: TrendingUp,
    title: '100% deposit bonus',
    desc: 'Promotional funds to trade more and manage risk — subject to XM terms and eligibility.',
  },
  {
    icon: Trophy,
    title: 'XM competitions',
    desc: 'Regular trading competitions with withdrawable cash prizes for active traders.',
  },
]

const CONDITIONS = [
  { label: 'Tight spreads', detail: 'from 0.8 pips on major pairs' },
  { label: 'Transparent pricing', detail: 'know your costs before you enter' },
  { label: 'Superior execution', detail: 'no requotes or rejections' },
  { label: 'Fast withdrawals', detail: 'over 92% auto-approved' },
  { label: `Linked to ${PARTNER_CODE}`, detail: 'your account connects to Bandi Shares' },
]

const STEPS = [
  {
    title: 'Open the XM Global registration page',
    desc: 'Use the button below to start a new real-account application with XM Global.',
  },
  {
    title: 'Enter our partner code',
    desc: `Add partner code ${PARTNER_CODE} so your account is linked to Bandi Shares.`,
  },
  {
    title: 'Verify your identity',
    desc: 'Upload your ID and proof of address so XM can approve and activate your account.',
  },
  {
    title: 'Fund & verify your XM ID',
    desc: 'Once funded, submit your XM Account ID in the verification form below so we can confirm your partnership and member pricing.',
  },
]

export default function XmPageClient() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = (window.top ?? window).location.hash
    if (hash === '#verify') {
      requestAnimationFrame(() => {
        document.getElementById('verify')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [])
  return (
    <>
      {/* Hero */}
      <section className="section-padding flex min-h-[50vh] items-center">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            initial={false}
            className="mb-4 block text-xs font-semibold uppercase tracking-[0.25em] text-primary"
          >
            XM Global Partner
          </motion.span>
          <motion.h1
            initial={false}
            className="mb-6 text-balance text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl md:text-6xl"
          >
            Open a real account,{' '}
            <span className="gradient-text-emerald">the right way.</span>
          </motion.h1>
          <motion.p
            initial={false}
            className="mx-auto max-w-2xl text-lg text-muted-foreground"
          >
            Bandi Shares is an official partner of XM Global. When you open your real trading account
            with our partner code, you&apos;re connected to the desk directly — and supported from your
            very first macro trade.
          </motion.p>
        </div>
      </section>

      {/* Partner code register block */}
      <section className="section-padding pt-0">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card grid gap-10 p-8 md:grid-cols-2 md:p-12"
          >
            <div>
              <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Use this when you register
              </span>
              <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
                Our XM Global partner code.
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                Enter the partner code below when you create your XM Global account so it&apos;s
                correctly linked to Bandi Shares. This is the code our traders use when they open a
                real account.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href={XM_LINKS.register}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-glow text-center text-sm uppercase tracking-wide"
                >
                  Open XM Global account
                </a>
                <PortalAuthLink kind="join" className="btn-ghost-glass text-center text-sm">
                  Sign Up
                </PortalAuthLink>
                <SiteLink href="/xm#verify" className="btn-ghost-glass text-center text-sm">
                  Verify your XM ID
                </SiteLink>
                <a
                  href={XM_LINKS.app}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost-glass text-center text-sm"
                >
                  Get XM App ↗
                </a>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
              <Image
                src={assetUrl('/assets/xm-logo.png')}
                alt="XM Global"
                width={160}
                height={70}
                className="h-auto w-[160px] object-contain"
              />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                XM Global partner code
              </span>
              <span className="font-mono text-3xl font-bold tracking-widest text-primary md:text-4xl">
                {PARTNER_CODE}
              </span>
              <p className="max-w-xs text-xs text-muted-foreground">
                Enter this code when you open your real XM Global account.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stat wall */}
      <section className="section-padding" aria-label="XM Global platform highlights">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              The platform
            </span>
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Numbers that back our partnership.
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              We recommend XM because the infrastructure matches the standard we teach — fair
              execution, scale and reliability.
            </p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-3">
            {STAT_WALL.map((stat, i) => (
              <motion.div
                key={stat.value}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card-hover p-8 text-center"
              >
                <div className="gradient-text-emerald mb-2 text-3xl font-bold md:text-4xl">
                  {stat.value}
                </div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">
            Platform figures published by XM Global. Availability and terms may vary by region and
            account type.
          </p>
        </div>
      </section>

      {/* Pillars */}
      <section className="section-padding pt-0" aria-label="XM products and offers">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Trader essentials
            </span>
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              What XM gives our community.
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Mobile trading, competitive conditions and regular promotions — everything behind code{' '}
              {PARTNER_CODE}.
            </p>
          </motion.div>

          <div className="mb-8 grid gap-5 md:grid-cols-3">
            {PILLARS.map((pillar, i) => (
              <motion.article
                key={pillar.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card-hover p-8"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <pillar.icon className="text-primary" size={22} />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-foreground">{pillar.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{pillar.desc}</p>
              </motion.article>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center md:p-8"
          >
            <div>
              <h3 className="mb-1 text-lg font-semibold text-foreground">Download the XM App</h3>
              <p className="text-sm text-muted-foreground">
                Top-rated on App Store and Google Play — the same app we recommend for macro traders
                on the move.
              </p>
            </div>
            <a
              href={XM_LINKS.app}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-glow shrink-0 text-sm uppercase tracking-wide"
            >
              Get the XM App ↗
            </a>
          </motion.div>
        </div>
      </section>

      {/* Trading conditions */}
      <section className="section-padding pt-0" aria-label="XM trading conditions">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-8 md:p-12"
          >
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Trading conditions
            </span>
            <h2 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
              Built for disciplined execution.
            </h2>
            <p className="mb-8 text-sm text-muted-foreground">
              The details that matter when you&apos;re applying macro logic on a live account.
            </p>

            <ul className="mb-8 space-y-3">
              {CONDITIONS.map((item) => (
                <li key={item.label} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
                  <span className="text-muted-foreground">
                    <b className="text-foreground">{item.label}</b> — {item.detail}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={XM_LINKS.app}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary-glow text-center text-sm uppercase tracking-wide"
              >
                Get the XM App
              </a>
              <PortalAuthLink kind="join" className="btn-ghost-glass text-center text-sm">
                Sign Up
              </PortalAuthLink>
              <SiteLink href="/xm#verify" className="btn-ghost-glass text-center text-sm">
                Verify your XM ID
              </SiteLink>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Setup steps */}
      <section className="section-padding pt-0">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-center"
          >
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Step by step
            </span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              How to set up your account.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Follow these steps — then verify your XM ID so we can confirm your partnership.
            </p>
          </motion.div>

          <ol className="space-y-4">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="glass-card flex gap-5 p-6"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <b className="mb-1 block text-foreground">{step.title}</b>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why through Bandi */}
      <section className="section-padding pt-0">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card grid gap-10 p-8 md:grid-cols-2 md:p-12"
          >
            <div>
              <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Why through Bandi Shares
              </span>
              <h2 className="mb-6 text-2xl font-bold text-foreground md:text-3xl">
                Setup support, not just a link.
              </h2>
              <ul className="space-y-4">
                {[
                  {
                    title: 'Guided onboarding',
                    desc: 'Help with registration, verification and funding.',
                  },
                  {
                    title: 'Correctly linked',
                    desc: 'Your account connects to Bandi Shares from day one.',
                  },
                  {
                    title: 'Trade with macro logic',
                    desc: 'Pair your broker with our educational programs and community.',
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={16} />
                    <span className="text-sm text-muted-foreground">
                      <b className="text-foreground">{item.title}</b> — {item.desc}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#verify" className="btn-primary-glow text-center text-sm uppercase tracking-wide">
                  Verify your XM ID
                </a>
                <PortalAuthLink kind="join" className="btn-ghost-glass text-center text-sm">
                  Sign Up
                </PortalAuthLink>
                <SiteLink href="/services" className="btn-ghost-glass text-center text-sm">
                  View programs
                </SiteLink>
              </div>
            </div>
            <div className="flex items-center justify-center rounded-xl border border-[hsla(var(--glass-border))] bg-[hsla(var(--glass-bg))] p-10">
              <Image
                src={assetUrl('/assets/xm-logo.png')}
                alt="XM Global"
                width={240}
                height={105}
                className="h-auto w-[240px] object-contain"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Verify XM — same page */}
      <section id="verify" className="section-padding scroll-mt-24 border-t border-[hsla(0,0%,100%,0.06)]">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 text-center text-sm text-muted-foreground">
            {xmMemberDiscountLabel()} — verify below to confirm your account is linked under{' '}
            <b className="font-mono text-foreground">{PARTNER_CODE}</b>.
          </p>
          <XmVerifyForm />
        </div>
      </section>
    </>
  )
}
