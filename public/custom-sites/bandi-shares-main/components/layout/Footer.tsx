import Link from 'next/link'
import { FooterPortalLinks } from '@/components/layout/FooterPortalLinks'

const NAV_ITEMS = [
  { label: 'Home',      href: '/'        },
  { label: 'About',     href: '/about'   },
  { label: 'Services',  href: '/services' },
  { label: 'Pricing',   href: '/pricing' },
  { label: 'Open XM',   href: '/xm'      },
  { label: 'Verify XM', href: '/verify'  },
]

const LEGAL_ITEMS = [
  { label: 'Terms of Service', href: '/terms'         },
  { label: 'Refund Policy',    href: '/refund-policy' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[hsla(0,0%,100%,0.08)]">
      <div className="mx-auto max-w-7xl px-6 py-16 md:px-12">
        {/* Logo + socials */}
        <div className="mb-12 flex flex-col items-center">
          <img
            src="/assets/logo.jpeg"
            alt="Bandi Shares — Economic Insights"
            width={45}
            height={45}
            className="logo-glow mb-6 object-cover"
          />
          <div className="flex items-center gap-5">
            {/* TikTok */}
            <a
              href="https://www.tiktok.com/@bandishares"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="TikTok"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
              </svg>
            </a>
            {/* Instagram */}
            <a
              href="https://www.instagram.com/bandishares/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Instagram"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Three-column grid */}
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-3">
          <div>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Macroeconomic Forex education and mentorship. We trade the data,
              not the noise. Data-driven. Disciplined. Decisive.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Navigate
            </h4>
            <div className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <FooterPortalLinks />
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Legal
            </h4>
            <div className="flex flex-col gap-2">
              {LEGAL_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Risk warning */}
        <div className="glass-card mb-8 p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-primary">
              ⚠ Risk Warning:
            </span>{' '}
            <strong className="text-foreground">
              Trading Forex involves significant risk. Only trade with money you can afford to lose.
            </strong>{' '}
            High leverage can work against you as well as for you. Before deciding to trade foreign
            exchange, you should carefully consider your investment objectives, level of experience,
            and risk appetite. Past performance is not indicative of future results.
          </p>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[hsla(0,0%,100%,0.05)] pt-6 md:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Bandi Shares. All rights reserved.
          </p>
          <div className="flex gap-6">
            {LEGAL_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mx-auto mt-6 max-w-2xl text-center text-[11px] leading-relaxed text-muted-foreground/60">
          Bandi Shares: Economic Insights is an educational platform. Trading Forex carries
          significant risk. Past performance does not guarantee future results.
        </p>

        {/* Brand maxim */}
        <p className="mx-auto mt-4 max-w-xl text-center font-mono text-xs italic text-muted-foreground/80">
          Trading is an economic science. Results require discipline. No magic patterns here, just data.
        </p>
      </div>
    </footer>
  )
}
