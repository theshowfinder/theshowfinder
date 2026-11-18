'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Bars3Icon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { NAV_LINKS, PRIMARY_CTA, BUSINESS_LINKS } from '@/lib/headerLinks'
import SavedLink from '@/components/SavedLink'

export default function Header() {
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  return (
    <header className="sticky top-0 z-50 shadow-lg" style={{ backgroundColor: '#1A1A2E' }}>
      {/* For organisers and businesses (desktop): a slim bar above the main nav */}
      <div className="hidden md:block border-b border-white/10 bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end gap-5 h-8 items-center text-xs font-semibold">
          <span className="text-white/40">For organisers &amp; businesses:</span>
          {BUSINESS_LINKS.map(({ label, href }) => (
            <Link key={label} href={href} className="text-white/75 hover:text-white transition-colors">{label}</Link>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0" onClick={() => { setMenuOpen(false); setSearchOpen(false) }}>
            <span className="text-2xl">🎟️</span>
            <span className="font-extrabold text-xl text-white tracking-tight">
              TheShow<span style={{ color: '#E8003D' }}>Finder</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-3">
            <SavedLink />
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </button>
            <Link
              href={PRIMARY_CTA.href}
              className="text-sm font-bold text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity min-h-[40px] flex items-center"
              style={{ backgroundColor: '#E8003D' }}
            >
              {PRIMARY_CTA.label}
            </Link>
          </div>

          {/* Mobile: search + hamburger */}
          <div className="flex md:hidden items-center gap-1">
            <SavedLink onNavigate={() => { setMenuOpen(false); setSearchOpen(false) }} />
            <button
              className="p-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => { setSearchOpen(!searchOpen); setMenuOpen(false) }}
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="h-6 w-6" />
            </button>
            <button
              className="p-3 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => { setMenuOpen(!menuOpen); setSearchOpen(false) }}
              aria-label="Toggle menu"
            >
              {menuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Search dropdown */}
      {searchOpen && (
        <div className="border-t border-white/10 px-4 py-3" style={{ backgroundColor: '#1A1A2E' }}>
          <form action="/events" method="get" className="max-w-2xl mx-auto flex gap-2">
            <input
              autoFocus
              type="text"
              name="q"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search artists, shows, venues…"
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white placeholder:text-white/50 border border-white/20 focus:outline-none focus:ring-2 text-base"
              style={{ '--tw-ring-color': '#E8003D' } as React.CSSProperties}
            />
            <button
              type="submit"
              className="px-5 py-3 text-white font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap min-h-[48px]"
              style={{ backgroundColor: '#E8003D' }}
            >
              Search
            </button>
          </form>
        </div>
      )}

      {/* Mobile nav menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 px-4 py-3 space-y-1" style={{ backgroundColor: '#1A1A2E' }}>
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center px-4 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors min-h-[48px]"
            >
              {label}
            </Link>
          ))}
          <div className="pt-3 border-t border-white/10">
            <p className="px-4 pb-1 text-xs font-bold uppercase tracking-widest text-white/40">For organisers &amp; businesses</p>
            <div className="grid grid-cols-3 gap-2 pb-3">
              {BUSINESS_LINKS.map(({ label, href }) => (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center px-3 py-3 rounded-lg text-sm font-bold text-white border border-white/20 hover:bg-white/10 transition-colors min-h-[48px] text-center"
                >
                  {label}
                </Link>
              ))}
            </div>
            <Link
              href={PRIMARY_CTA.href}
              onClick={() => setMenuOpen(false)}
              className="text-center text-sm font-bold text-white py-3 rounded-xl hover:opacity-90 transition-opacity min-h-[48px] flex items-center justify-center"
              style={{ backgroundColor: '#E8003D' }}
            >
              {PRIMARY_CTA.label}
            </Link>
            <p className="text-center text-white/50 text-xs mt-2">Just your email — no password, no account needed.</p>
          </div>
        </div>
      )}
    </header>
  )
}
