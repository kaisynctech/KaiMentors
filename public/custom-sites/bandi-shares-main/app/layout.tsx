import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import CustomCursor from '@/components/CustomCursor'

// next/font handles Inter — no external @import needed in globals.css for this.
// The @import in globals.css is kept as a fallback; next/font takes priority.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'Bandi Shares | MacroEconomics Forex Trading Education',
    template: '%s | Bandi Shares FX',
  },
  description:
    'Macroeconomic Forex education and mentorship. We trade the data, not the noise. Data-driven. Disciplined. Decisive.',
  keywords: [
    'forex trading education',
    'macroeconomic trading',
    'trading mentorship',
    'South Africa forex',
    'fundamental analysis',
    'XAU USD gold trading',
    'Shares Worldwide',
  ],
  authors: [{ name: 'Bandi Shares FX' }],
  openGraph: {
    type: 'website',
    locale: 'en_ZA',
    url: 'https://www.sharesworldwide.trade',
    siteName: 'Bandi Shares FX',
    title: 'Bandi Shares | MacroEconomics Forex Trading Education',
    description:
      'Macroeconomic Forex education and mentorship. We trade the data, not the noise.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bandi Shares | MacroEconomics Forex Trading Education',
    description:
      'Macroeconomic Forex education and mentorship. We trade the data, not the noise.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#020617' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        {/*
         * Inline theme script — runs before React hydrates to prevent FOUC.
         * Reads localStorage and applies the .dark class immediately so the
         * user never sees a flash of the wrong colour scheme.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('bandi-theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = (stored === 'light' || stored === 'dark')
                    ? stored
                    : (prefersDark ? 'dark' : 'light');
                  document.documentElement.classList.toggle('dark', theme === 'dark');
                  document.documentElement.style.colorScheme = theme;
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <Providers>
          {/* Custom GSAP cursor — hidden automatically on touch devices */}
          <CustomCursor />
          <Navbar />
          <main className="flex min-h-screen flex-col pt-16 mesh-background">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
