import { FooterPortalLinks } from '@/components/layout/FooterPortalLinks'
import XmPartnerFooter from '@/components/layout/XmPartnerFooter'
import { SiteLink } from '@/components/site-link'

const NAV_ITEMS = [
  { label: 'Home',     href: '/'        },
  { label: 'About',    href: '/about'   },
  { label: 'Programs', href: '/services' },
  { label: 'XM',       href: '/xm'      },
  { label: 'Articles', href: '/articles' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[hsla(0,0%,100%,0.08)]">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-12">
        <div className="grid gap-8 md:grid-cols-[1fr,auto,auto] md:items-start">
          <XmPartnerFooter />

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Navigate
            </h4>
            <div className="flex flex-col gap-1.5">
              {NAV_ITEMS.map((item) => (
                <SiteLink
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </SiteLink>
              ))}
              <FooterPortalLinks />
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Connect
            </h4>
            <div className="flex gap-4">
              <a
                href="https://www.tiktok.com/@bandishares"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="TikTok"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/bandishares/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Instagram"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                </svg>
              </a>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <SiteLink href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
                Terms
              </SiteLink>
              <SiteLink href="/refund-policy" className="text-sm text-muted-foreground hover:text-foreground">
                Refund Policy
              </SiteLink>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-[hsla(0,0%,100%,0.06)] pt-4 text-[11px] leading-relaxed text-muted-foreground/70 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} Bandi Shares · Trading involves significant risk ·
            Educational content only
          </p>
          <p className="text-muted-foreground/50">
            Original website by <span className="text-muted-foreground/70">Simamkele</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
