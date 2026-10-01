import Link from 'next/link'
import { SOCIAL_LINKS } from '@/lib/socialLinks'

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

// Maps each platform to its icon component — kept here, next to the
// icon definitions, while the label/href data itself lives in
// src/lib/socialLinks.ts so it's testable with plain `node --test`
// (this file isn't — no component-level test harness exists in this
// codebase for JSX/React components).
const SOCIAL_ICONS: Record<string, () => React.ReactElement> = {
  Instagram: InstagramIcon,
  TikTok:    TikTokIcon,
  Facebook:  FacebookIcon,
}

const discover = [
  { label: 'News',     href: '/news' },
  { label: 'On Sale',  href: '/on-sale-this-week' },
  { label: 'Concerts', href: '/events?category=concert' },
  { label: 'Theatre',  href: '/events?category=theatre' },
  { label: 'Comedy',   href: '/events?category=comedy' },
  { label: 'Sports',   href: '/events?category=sports' },
  { label: 'Family',   href: '/events?category=family' },
]

const cities = [
  'London', 'Manchester', 'Birmingham', 'Glasgow', 'Edinburgh',
  'Leeds', 'Liverpool', 'Bristol', 'Cardiff', 'Belfast',
  'Nottingham', 'Newcastle', 'Leicester', 'Sheffield', 'Derby',
  'Coventry', 'Southampton', 'Portsmouth', 'Norwich', 'Brighton',
  'Oxford', 'Cambridge', 'Exeter', 'Plymouth', 'Hull',
  'Middlesbrough', 'Sunderland', 'Bradford', 'Reading', 'Milton Keynes',
  'Bournemouth', 'Ipswich', 'Stoke-on-Trent', 'Wolverhampton', 'Swansea',
  'Aberdeen',
]

export default function Footer() {
  return (
    <footer style={{ backgroundColor: '#1A1A2E' }} className="text-white/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">

        {/* Grid: logo + 4 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-10 mb-14">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <span className="text-2xl">🎟️</span>
              <span className="font-extrabold text-xl text-white tracking-tight">
                TheShow<span style={{ color: '#E8003D' }}>Finder</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-white/50 max-w-xs">
              The UK&apos;s favourite events discovery platform — concerts, theatre, comedy, sports and family shows.
            </p>
          </div>

          {/* Discover */}
          <div>
            <h3 className="text-xs font-extrabold text-white uppercase tracking-widest mb-5">Discover</h3>
            <ul className="space-y-3">
              {discover.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cities — two columns */}
          <div className="col-span-2">
            <h3 className="text-xs font-extrabold text-white uppercase tracking-widest mb-5">Cities</h3>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {cities.map(city => (
                <li key={city}>
                  <Link href={`/cities/${encodeURIComponent(city)}`} className="text-sm hover:text-white transition-colors">
                    {city}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-extrabold text-white uppercase tracking-widest mb-5">Company</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="/about"     className="hover:text-white transition-colors">About</Link></li>
              <li><Link href="/contact"   className="hover:text-white transition-colors">Contact</Link></li>
              <li><Link href="/advertise" className="hover:text-white transition-colors">Advertise with us</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-extrabold text-white uppercase tracking-widest mb-5">Legal</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms"          className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/cookies"        className="hover:text-white transition-colors">Cookie Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-5">
          <p className="text-sm text-white/40 text-center sm:text-left">
            © 2026 TheShowFinder
          </p>

          {/* Follow TheShowFinder — social icons, clearly labelled rather than
              just a row of unlabelled icons. Links only: no embedded feeds or
              widgets, so this stays as light as the rest of the footer. */}
          <nav aria-label="Follow TheShowFinder on social media" className="flex flex-col items-center sm:items-end gap-2">
            <span className="text-xs font-extrabold text-white uppercase tracking-widest">
              Follow TheShowFinder
            </span>
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ platform, label, href }) => {
                const Icon = SOCIAL_ICONS[platform]
                return (
                  <a
                    key={platform}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-[#E8003D] bg-white/10 transition-all duration-150"
                  >
                    <Icon />
                  </a>
                )
              })}
            </div>
          </nav>
        </div>
      </div>
    </footer>
  )
}
