# Bandi Shares FX — Next.js 16

Full migration of `sharesworldwide.trade` from Lovable/Vite to **Next.js 16 App Router**.

---

## Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Framework    | Next.js 16 (App Router, Turbopack)  |
| Language     | TypeScript 5                        |
| Styling      | Tailwind CSS 3 + CSS custom props   |
| Motion       | Framer Motion 11                    |
| Cursor       | GSAP 3                              |
| UI           | shadcn/ui (Radix primitives)        |
| Forms        | react-hook-form + Zod               |
| Data         | TanStack Query v5                   |
| Toasts       | Radix Toast + Sonner                |
| Fonts        | next/font → Inter (Google Fonts)    |
| Bundler      | Turbopack (Next.js 16 default)      |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Drop your image assets
#    See public/assets/README.md for the full list.

# 3. Start dev server (Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Key Next.js 16 Conventions Used

### `proxy.ts` — replaces `middleware.ts`
Network-layer logic lives in `proxy.ts`. The exported function is named `proxy` (not `middleware`).
The `/apply → /verify` redirect is handled here as well as in `next.config.ts` redirects (belt-and-suspenders).

### `'use cache'` directive
Static pages (`/terms`, `/refund-policy`) are eligible for Cache Components — annotate them with
`'use cache'` at the file level when you're ready to opt in:

```ts
'use cache'           // ← add this as the very first line
import type { Metadata } from 'next'
// ...
```

This tells Next.js 16 to fully pre-render and cache the component at build time and serve it
instantly from the edge, replacing the older `export const revalidate = ...` pattern.

### Server vs Client split

| Component              | Boundary       | Reason                                  |
|------------------------|----------------|-----------------------------------------|
| `app/layout.tsx`       | Server         | Metadata, fonts, static shell           |
| `app/terms/page.tsx`   | Server         | Fully static — eligible for use cache   |
| `app/refund-policy/`   | Server         | Fully static — eligible for use cache   |
| `components/Providers` | `'use client'` | Context, QueryClient                    |
| `Navbar`               | `'use client'` | Scroll state, usePathname               |
| `TradingViewTicker`    | `'use client'` | Script injection, useEffect             |
| `CustomCursor`         | `'use client'` | GSAP, mouse events                      |
| `ThemeToggle`          | `'use client'` | useTheme context                        |
| All pages              | `'use client'` | Framer Motion requires client rendering |

### `next/font`
`Inter` is loaded via `next/font/google` in `app/layout.tsx`. This eliminates the external
Google Fonts `@import` request, inlines the font CSS, and self-hosts the font files — better
CLS scores and no third-party font waterfall.

### `next/image`
All `<img>` tags replaced with `<Image>` from `next/image`:
- Gallery images use `fill` + `sizes` for responsive delivery
- Logo uses explicit `width` / `height`
- Hero background remains a CSS `backgroundImage` (not suitable for `<Image fill>`)

### `next/link`
All `react-router-dom` `<Link>` replaced with `next/link`. Prefetching on hover is automatic.

### `next/navigation`
`usePathname()` replaces `useLocation()` for active link detection in the Navbar.

---

## Project Structure

```
bandi-shares/
├── app/
│   ├── layout.tsx             # Root layout — metadata, fonts, shell
│   ├── globals.css            # Full design token system (CSS custom props)
│   ├── page.tsx               # / — Hero, gallery, why section, CTA
│   ├── about/page.tsx         # /about
│   ├── services/page.tsx      # /services
│   ├── pricing/page.tsx       # /pricing
│   ├── verify/page.tsx        # /verify — XM account verification form
│   ├── terms/page.tsx         # /terms (server component)
│   ├── refund-policy/page.tsx # /refund-policy (server component)
│   └── not-found.tsx          # 404
├── components/
│   ├── Providers.tsx          # Client: QueryClient, Theme, Tooltip, Toasters
│   ├── CustomCursor.tsx       # Client: GSAP cursor (touch-safe)
│   ├── ThemeToggle.tsx        # Client: animated sun/moon
│   └── layout/
│       ├── Navbar.tsx         # Client: scroll + mobile menu + active links
│       ├── Footer.tsx         # Server: static columns + legal links
│       └── TradingViewTicker.tsx # Client: TradingView widget injection
├── components/ui/             # shadcn/ui primitives
│   ├── accordion.tsx
│   ├── button.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── toast.tsx
│   ├── toaster.tsx
│   ├── sonner.tsx
│   └── tooltip.tsx
├── contexts/
│   └── ThemeContext.tsx       # Client: light/dark with localStorage
├── config/
│   └── links.ts               # Whop affiliate links
├── hooks/
│   └── use-toast.ts           # shadcn toast state
├── lib/
│   └── utils.ts               # cn() utility
├── public/
│   └── assets/                # ← drop your images here
├── proxy.ts                   # Next.js 16 network proxy (→ /apply redirect)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Adding a Verify Route Handler

The verification form currently logs to the console. To wire it to a real endpoint, create:

```ts
// app/api/verify/route.ts
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  // Save to DB, trigger email, Slack webhook, etc.
  console.log('[Verify]', body)
  return NextResponse.json({ ok: true })
}
```

Then in `app/verify/page.tsx`, replace the `setTimeout` mock with:

```ts
await fetch('/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})
```

---

## Environment Variables

Create `.env.local` for any secrets:

```bash
# Example — if you add a backend integration
NEXT_PUBLIC_SITE_URL=https://www.sharesworldwide.trade
```

---

## Deploy

The app is deployment-ready for **Vercel** (recommended — native Next.js 16 support):

```bash
npx vercel --prod
```

For other hosts (Netlify, Railway, etc.), ensure they support Next.js 16 Server Components.

---

## Adding More shadcn Components

If you need additional shadcn/ui components (dialog, select, popover, etc.):

```bash
npx shadcn@latest add dialog
npx shadcn@latest add select
```

The CLI reads your `tailwind.config.ts` and `components/ui/` directory automatically.

---

*Built by Simcita. Migrated from Lovable → Next.js 16 App Router.*
