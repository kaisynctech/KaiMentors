'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

const SYMBOLS = [
  { description: 'Gold', proName: 'OANDA:XAUUSD' },
  { description: 'Nas100', proName: 'OANDA:NAS100USD' },
  { description: 'US30', proName: 'OANDA:US30USD' },
  { description: 'Oil', proName: 'TVC:USOIL' },
  { description: 'EUR/USD', proName: 'FX:EURUSD' },
  { description: 'GBP/USD', proName: 'FX:GBPUSD' },
  { description: 'USD/JPY', proName: 'FX:USDJPY' },
]

interface TradingViewTickerProps {
  /** Home-only inline strip (not fixed under the navbar). */
  inline?: boolean
}

function readDocumentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export default function TradingViewTicker({ inline = false }: TradingViewTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const container = containerRef.current
    if (!container) return

    const colorTheme = readDocumentTheme()

    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>'

    const config = {
      symbols: SYMBOLS,
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: 'adaptive',
      colorTheme,
      locale: 'en',
    }

    const script = document.createElement('script')
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js'
    script.async = true
    script.type = 'text/javascript'
    script.innerHTML = JSON.stringify(config)
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [mounted, theme])

  return (
    <div
      className={`tradingview-ticker-strip overflow-hidden border-y ${
        inline ? '' : 'fixed left-0 right-0 top-16 z-40 border-b'
      }`}
      aria-label="Live forex and commodities ticker"
    >
      <div ref={containerRef} className="tradingview-widget-container" />
    </div>
  )
}
