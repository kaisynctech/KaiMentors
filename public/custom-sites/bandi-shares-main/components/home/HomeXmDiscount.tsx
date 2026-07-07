'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Percent, ShieldCheck } from 'lucide-react'
import {
  PARTNER_CODE,
  XM_LINKS,
  xmMemberDiscountLabel,
  XM_MEMBER_DISCOUNT_PERCENT,
} from '@/config/site'
import { SiteLink } from '@/components/site-link'
import { assetUrl } from '@/lib/site-url'

export default function HomeXmDiscount() {
  return (
    <section className="section-padding pt-0" aria-label="XM member pricing">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card grid gap-10 p-8 md:grid-cols-[1fr,auto] md:p-12"
        >
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5">
              <ShieldCheck className="text-primary" size={14} />
              <span className="text-xs font-medium uppercase tracking-wider text-primary">
                XM verified member pricing
              </span>
            </div>
            <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
              Already on XM under Bandi Shares?{' '}
              <span className="gradient-text-emerald">You don&apos;t pay full price.</span>
            </h2>
            <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Public Whop links show standard rates. If your real XM account is linked to partner
              code <b className="font-mono text-foreground">{PARTNER_CODE}</b>, verified members
              unlock discounted access to our educational programs — not the full retail price.
            </p>
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/5 p-4">
              <Percent className="mt-0.5 shrink-0 text-primary" size={18} />
              <div className="text-sm text-muted-foreground">
                <b className="text-foreground">{xmMemberDiscountLabel()}</b>
                {!XM_MEMBER_DISCOUNT_PERCENT && (
                  <span className="mt-1 block text-xs">
                    Exact discount tiers are being finalised — verify your account now and we&apos;ll
                    confirm your member rate.
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <SiteLink
                href="/xm#verify"
                className="btn-primary-glow text-center text-sm uppercase tracking-wide"
              >
                Verify if I have an XM account
              </SiteLink>
              <SiteLink href="/xm" className="btn-ghost-glass text-center text-sm">
                Open XM account
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
              width={120}
              height={52}
              className="h-auto w-[120px] object-contain"
            />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Partner code
            </span>
            <span className="font-mono text-3xl font-bold tracking-widest text-primary">
              {PARTNER_CODE}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
