'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { PARTNER_CODE, XM_LINKS } from '@/config/site'
import { PortalAuthLink } from '@/components/portal-auth-link'

const PILLS = [
  { value: '13.5B+', label: 'trades' },
  { value: 'Zero', label: 'requotes' },
  { value: '92.9%', label: 'fast withdrawals' },
  { value: 'XM App', label: null },
  { value: '0.8 pip', label: 'spreads' },
  { value: '100%', label: 'deposit bonus' },
  { value: 'XM', label: 'competitions' },
]

export default function HomeXmSections() {
  return (
    <>
      {/* Home summary — why we partner with XM */}
      <section className="section-padding" aria-label="Why Bandi Shares partners with XM">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card grid gap-10 p-8 md:grid-cols-[auto,1fr] md:p-12"
          >
            <div className="flex shrink-0 items-start justify-center md:justify-start">
              <Image
                src="/assets/xm-logo.png"
                alt="XM Global"
                width={100}
                height={44}
                className="h-auto w-[100px] object-contain"
              />
            </div>

            <div>
              <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Official XM Global partner
              </span>
              <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
                Why Bandi Shares partners with XM.
              </h2>
              <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Macro education needs a regulated broker with serious execution, mobile access and
                transparent conditions. XM Global gives our community the platform to apply what we
                teach — and partner code{' '}
                <b className="font-mono text-foreground">{PARTNER_CODE}</b> links your account to
                the desk from day one.
              </p>

              <div className="mb-6 flex flex-wrap gap-2">
                {PILLS.map((pill) => (
                  <span
                    key={`${pill.value}-${pill.label}`}
                    className="rounded-full border border-[hsla(var(--glass-border))] bg-[hsla(var(--glass-bg))] px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    <b className="text-foreground">{pill.value}</b>
                    {pill.label ? ` ${pill.label}` : ''}
                  </span>
                ))}
              </div>

              <p className="mb-6 text-xs text-muted-foreground">
                This is the overview — platform details, app download and step-by-step setup are on
                Open XM.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/xm" className="btn-primary-glow text-center text-sm uppercase tracking-wide">
                  Full XM benefits &amp; setup
                </Link>
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
          </motion.div>
        </div>
      </section>

      {/* XM strip — partner code + quick actions */}
      <section className="section-padding pt-0" aria-label="Open an XM account">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card grid gap-10 p-8 md:grid-cols-2 md:p-12"
          >
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5">
                <ShieldCheck className="text-primary" size={14} />
                <span className="text-xs font-medium uppercase tracking-wider text-primary">
                  Official XM Global Partner
                </span>
              </div>
              <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
                Open a real XM account, the right way.
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                Bandi Shares is an official XM Global partner. New traders get guided setup and use
                our partner code when opening a real account — so you&apos;re connected and supported
                from day one.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/xm" className="btn-primary-glow text-center text-sm uppercase tracking-wide">
                  Start XM setup
                </Link>
                <PortalAuthLink kind="join" className="btn-ghost-glass text-center text-sm">
                  Sign Up
                </PortalAuthLink>
                <Link href="/verify" className="btn-ghost-glass text-center text-sm">
                  Verify your XM ID
                </Link>
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
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                XM Global partner code
              </span>
              <span className="font-mono text-3xl font-bold tracking-widest text-primary md:text-4xl">
                {PARTNER_CODE}
              </span>
              <Image
                src="/assets/xm-logo.png"
                alt="XM Global"
                width={120}
                height={52}
                className="h-auto w-[120px] object-contain opacity-90"
              />
              <p className="max-w-xs text-xs text-muted-foreground">
                Enter this code when you open your real XM Global account.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
