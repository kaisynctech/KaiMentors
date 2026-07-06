'use client'

import { useEffect, useRef } from 'react'

const TICKER_CONFIG = {
  symbols: [
    { description: 'Gold',    proName: 'OANDA:XAUUSD'   },
    { description: 'Nas100',  proName: 'OANDA:NAS100USD' },
    { description: 'US30',    proName: 'OANDA:US30USD'   },
    { description: 'Oil',     proName: 'TVC:USOIL'       },
    { description: 'EUR/USD', proName: 'FX:EURUSD'       },
    { description: 'GBP/USD', proName: 'FX:GBPUSD'       },
    { description: 'USD/JPY', proName: 'FX:USDJPY'       },
  ],
  showSymbolLogo: true,
  isTransparent: true,
  displayMode: 'adaptive',
  colorTheme: 'dark',
  locale: 'en',
}

export default function TradingViewTicker() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Guard against double injection on hot reload.
    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>'

    const script = document.createElement('script')
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js'
    script.async = true
    script.type = 'text/javascript'
    script.innerHTML = JSON.stringify(TICKER_CONFIG)
    container.appendChild(script)

    return () => {
      if (container) container.innerHTML = ''
    }
  }, [])

  return (
    <div className="fixed left-0 right-0 top-16 z-40 border-b border-[hsla(0,0%,100%,0.08)] bg-[hsl(var(--midnight))]">
      <div ref={containerRef} className="tradingview-widget-container" />
    </div>
  )
}
