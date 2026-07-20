import { assetUrl } from '@/lib/site-url'

export default function XmPartnerFooter() {
  return (
    <div className="xm-partner-footer flex items-center gap-3 border-b border-[hsla(0,0%,100%,0.08)] pb-4">
      <img
        src={assetUrl('/assets/xm-logo.png')}
        alt="XM Global"
        width={72}
        height={32}
        className="h-8 w-auto object-contain"
        loading="lazy"
      />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Official XM partner
        </p>
        <p className="truncate text-xs text-muted-foreground">Bandi Shares FX</p>
      </div>
    </div>
  )
}
