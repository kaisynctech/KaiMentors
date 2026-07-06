'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

const INTERACTIVE =
  "a, button, [role='button'], input, textarea, select, .glass-card-hover, .btn-primary-glow, .btn-ghost-glass"

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const [isTouch, setIsTouch] = useState(true) // default hidden until mounted

  useEffect(() => {
    // Only show custom cursor on pointer devices.
    setIsTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    if (isTouch) return
    const dot  = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    const onMove = (e: MouseEvent) => {
      gsap.to(dot,  { x: e.clientX, y: e.clientY, duration: 0.15, ease: 'power2.out' })
      gsap.to(ring, { x: e.clientX, y: e.clientY, duration: 0.40, ease: 'power2.out' })
    }

    const onOver = (e: MouseEvent) => {
      if ((e.target as Element)?.closest?.(INTERACTIVE)) {
        gsap.to(ring, { width: 48, height: 48, opacity: 1, duration: 0.3, ease: 'power2.out' })
        gsap.to(dot,  { scale: 0.5, duration: 0.3 })
      }
    }

    const onOut = (e: MouseEvent) => {
      if ((e.target as Element)?.closest?.(INTERACTIVE)) {
        gsap.to(ring, { width: 0, height: 0, opacity: 0, duration: 0.3, ease: 'power2.out' })
        gsap.to(dot,  { scale: 1, duration: 0.3 })
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
    }
  }, [isTouch])

  if (isTouch) return null

  return (
    <>
      <div
        ref={dotRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999]"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'hsl(155 70% 45%)',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 12px hsla(155,70%,45%,0.5)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        ref={ringRef}
        className="pointer-events-none fixed left-0 top-0 z-[9998]"
        style={{
          width: 0,
          height: 0,
          borderRadius: '50%',
          border: '1px solid hsla(155,70%,45%,0.4)',
          background: 'hsla(155,70%,45%,0.06)',
          backdropFilter: 'blur(4px)',
          transform: 'translate(-50%, -50%)',
          opacity: 0,
        }}
      />
    </>
  )
}
