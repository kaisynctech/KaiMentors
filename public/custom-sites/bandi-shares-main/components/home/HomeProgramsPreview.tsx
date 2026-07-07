'use client'

import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { HOME_PROGRAM_PREVIEW } from '@/config/programs'
import { SiteLink } from '@/components/site-link'

export default function HomeProgramsPreview() {
  return (
    <section className="section-padding" id="programs">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <span className="mb-3 block font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Programs &amp; pricing
          </span>
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Choose your <span className="gradient-text-emerald">macro edge</span>
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            From free community access to the full 6-month transformation — built for operators,
            not spectators.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {HOME_PROGRAM_PREVIEW.map((tier, i) => (
            <motion.div
              key={tier.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`glass-card-hover flex flex-col p-6 md:p-7 ${
                tier.featured ? 'ring-1 ring-primary/30 md:col-span-1' : ''
              }`}
            >
              <span className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                {tier.tag}
              </span>
              <h3 className="mb-3 text-lg font-bold leading-snug text-foreground">{tier.title}</h3>
              <p className="mb-5 flex-1 text-sm text-muted-foreground">{tier.sub}</p>
              <div className="mb-5 flex items-baseline gap-2 border-l-2 border-primary pl-3">
                <span className="font-mono text-2xl font-bold text-foreground">{tier.price}</span>
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {tier.priceMeta}
                </span>
              </div>
              <ul className="mb-6 space-y-2">
                {tier.features.slice(0, 2).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={12} />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <SiteLink href="/services" className="btn-primary-glow text-sm uppercase tracking-wide">
            View all programs &amp; pricing
          </SiteLink>
        </div>
      </div>
    </section>
  )
}
