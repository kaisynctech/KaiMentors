'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { PortalAuthLink } from '@/components/portal-auth-link'
import { SiteLink } from '@/components/site-link'
import { assetUrl } from '@/lib/site-url'

const NAV_LINKS = [
  { label: 'Home',     href: '/'        },
  { label: 'About',    href: '/about'   },
  { label: 'Programs', href: '/services' },
  { label: 'XM',       href: '/xm'      },
]

export default function Navbar() {
  const pathname    = usePathname()
  const [scrolled, setScrolled]     = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <motion.nav
      initial={false}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 glass-nav ${
        scrolled ? 'shadow-lg' : ''
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-12">
        <SiteLink href="/" className="flex items-center gap-2">
          <Image
            src={assetUrl('/assets/logo.jpeg')}
            alt="Bandi Shares — Economic Insights"
            width={45}
            height={45}
            className="logo-glow object-cover"
            priority
          />
        </SiteLink>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <SiteLink
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors duration-200 ${
                pathname === link.href
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {link.label}
            </SiteLink>
          ))}
          <ThemeToggle />
          <PortalAuthLink
            kind="login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Login
          </PortalAuthLink>
          <PortalAuthLink
            kind="join"
            className="btn-primary-glow shimmer-btn text-xs uppercase tracking-wide"
          >
            Sign Up
          </PortalAuthLink>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 text-foreground"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-nav border-t border-[hsla(0,0%,100%,0.08)] md:hidden"
          >
            <div className="flex flex-col gap-3 px-6 py-4">
              {NAV_LINKS.map((link) => (
                <SiteLink
                  key={link.href}
                  href={link.href}
                  className={`py-2 text-sm font-medium ${
                    pathname === link.href
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }`}
                >
                  {link.label}
                </SiteLink>
              ))}
              <PortalAuthLink
                kind="login"
                className="py-2 text-sm font-medium text-muted-foreground"
              >
                Login
              </PortalAuthLink>
              <PortalAuthLink
                kind="join"
                className="btn-primary-glow shimmer-btn mt-2 text-center text-xs uppercase tracking-wide"
              >
                Sign Up
              </PortalAuthLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
