'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Percent, ShieldCheck } from 'lucide-react'
import { PROGRAMS } from '@/config/programs'
import { PARTNER_CODE, xmMemberDiscountLabel, XM_MEMBER_DISCOUNT_PERCENT } from '@/config/site'
import { SiteLink } from '@/components/site-link'

export default function ProgramsPage() {
  return (
    <>
      <section className="section-padding flex min-h-[40vh] items-center">
        <div className="mx-auto max-w-5xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 block text-xs font-semibold uppercase tracking-[0.25em] text-primary"
          >
            Programs &amp; pricing
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 text-balance text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl md:text-6xl"
          >
            Services &amp;{' '}
            <span className="gradient-text-emerald">pricing</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-muted-foreground"
          >
            Five tiers. One macro framework. XM-verified members unlock discounted rates — not the
            full public price.
          </motion.p>
        </div>
      </section>

      <section className="section-padding pt-0">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card mb-10 flex flex-col gap-4 border-primary/20 p-6 md:flex-row md:items-center md:justify-between md:p-8"
          >
            <div className="flex items-start gap-3">
              <Percent className="mt-0.5 shrink-0 text-primary" size={20} />
              <div>
                <p className="mb-1 text-sm font-semibold text-foreground">
                  {xmMemberDiscountLabel()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Linked to XM under code{' '}
                  <b className="font-mono text-foreground">{PARTNER_CODE}</b>? Verify your account
                  and access member pricing on every program below.
                  {!XM_MEMBER_DISCOUNT_PERCENT && (
                    <span className="mt-1 block text-xs">
                      Exact discount percentage coming soon — verify now to lock in member status.
                    </span>
                  )}
                </p>
              </div>
            </div>
            <SiteLink
              href="/xm#verify"
              className="btn-primary-glow shrink-0 text-center text-sm uppercase tracking-wide"
            >
              Verify XM account
            </SiteLink>
          </motion.div>
        </div>

        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {PROGRAMS.map((tier, i) => (
            <motion.div
              key={tier.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.6, ease: 'easeOut' }}
              className={`glass-card-hover group flex flex-col p-7 md:p-8 ${tier.span} ${
                tier.featured ? 'ring-1 ring-primary/30' : ''
              }`}
            >
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

              <div className="mb-6 flex items-baseline gap-2 border-l-2 border-primary pl-3">
                <span className="font-mono text-3xl font-bold tracking-tight text-foreground">
                  {tier.price}
                </span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {tier.priceMeta}
                </span>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Public rate shown — XM-verified members pay less.
              </p>

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

      <section className="section-padding">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-10"
          >
            <ShieldCheck className="mx-auto mb-4 text-primary" size={28} />
            <h3 className="mb-3 text-xl font-bold text-foreground">Our Commitment to You</h3>
            <p className="mx-auto mb-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              We don&apos;t promise overnight riches — we promise a proven framework, relentless
              support, and a community that holds you to a higher standard.
            </p>
            <p className="mx-auto max-w-xl text-xs leading-relaxed text-muted-foreground">
              All sales of digital products are final once access is granted. See our{' '}
              <SiteLink href="/refund-policy" className="text-primary hover:underline">
                Refund Policy
              </SiteLink>{' '}
              and{' '}
              <SiteLink href="/terms" className="text-primary hover:underline">
                Terms of Service
              </SiteLink>
              .
            </p>
          </motion.div>
        </div>
      </section>
    </>
  )
}
