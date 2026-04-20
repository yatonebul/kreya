'use client'

import { useState, useEffect } from 'react'

export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <nav
      className={open ? 'open' : undefined}
      style={scrolled ? { background: 'rgba(7,7,13,.95)' } : undefined}
    >
      <div className="nav-logo">KREY<span className="ac">A</span>.</div>
      <div className="nav-sp" />
      <div className="nav-links">
        <a href="#how" className="nav-link" onClick={close}>How it works</a>
        <a href="#features" className="nav-link" onClick={close}>Features</a>
        <a href="#platforms" className="nav-link" onClick={close}>Platforms</a>
        <a href="#pricing" className="nav-link" onClick={close}>Pricing</a>
        <a href="#cta" className="nav-cta" onClick={close}>Get started free →</a>
      </div>
      <button
        className="nav-mobile-toggle"
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle menu"
        aria-expanded={open}
      >
        {open ? '✕' : '☰'}
      </button>
    </nav>
  )
}
