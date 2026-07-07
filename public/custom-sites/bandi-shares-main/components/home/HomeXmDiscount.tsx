'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'
import { PARTNER_CODE, XM_LINKS } from '@/config/site'
import { SiteLink } from '@/components/site-link'
import { assetUrl } from '@/lib/site-url'
import XmMemberAccessCallout from '@/components/xm/XmMemberAccessCallout'

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
              XM student?{' '}
              <span className="gradient-text-emerald">Sign in for member rates.</span>
            </h2>
            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Buttons on this public site go to full-price Whop checkout. To access the verified XM
              student discount, sign in to the Bandi Shares portal first — discounted links unlock
              inside your portal once your XM account under{' '}
              <b className="font-mono text-foreground">{PARTNER_CODE}</b> is confirmed.
            </p>

            <XmMemberAccessCallout />
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
            <SiteLink href="/xm" className="btn-ghost-glass text-xs">
              Open XM account
            </SiteLink>
            <a
              href={XM_LINKS.app}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Get XM App ↗
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
