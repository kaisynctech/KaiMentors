import { assetUrl } from '@/lib/site-url'

export default function XmPartnerFooter() {
  return (
    <div className="xm-partner-footer mx-auto mb-10 flex max-w-md flex-col items-center gap-3 border-b-2 border-primary pb-6">
      <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        In partnership with
      </span>
      <img
        src={assetUrl('/assets/xm-logo.png')}
        alt="XM Global — Official Partner"
        width={128}
        height={56}
        className="h-12 w-auto object-contain md:h-14"
        loading="lazy"
      />
      <span className="text-center text-xs text-muted-foreground">
        Official XM Global partner · Bandi Shares
      </span>
    </div>
  )
}
