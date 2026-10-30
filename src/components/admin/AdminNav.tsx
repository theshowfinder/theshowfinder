'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The admin's six tabs. Every admin page sits under one of them; the row underneath lists that tab's pages.
// Today is the only page needed each morning: it links to whatever is waiting.
const TABS: Array<{ label: string; href: string; pages: Array<[string, string]> }> = [
  { label: 'Today', href: '/admin', pages: [['/admin', 'Morning check'], ['/admin/decisions', 'Decisions'], ['/admin/intelligence', 'Intelligence'], ['/admin/health', 'System']] },
  { label: 'Shows', href: '/admin/events', pages: [['/admin/events', 'Events'], ['/admin/artists', 'Artists'], ['/admin/ticket-links', 'Ticket links']] },
  { label: 'Imports', href: '/admin/feeds', pages: [['/admin/feeds', 'Feeds & matching'], ['/admin/ticketmaster', 'Ticketmaster'], ['/admin/gigsberg', 'Gigsberg'], ['/admin/see-tickets', 'See Tickets'], ['/admin/unmatched', 'Unmatched'], ['/admin/local-events', 'Local listings']] },
  { label: 'Content', href: '/admin/news', pages: [['/admin/news', 'News inbox'], ['/admin/social', 'Social posts']] },
  { label: 'Advertisers', href: '/admin/advertiser-applications', pages: [['/admin/advertiser-applications', 'Applications'], ['/admin/local-businesses', 'Businesses']] },
  { label: 'Audience', href: '/admin/subscribers', pages: [['/admin/subscribers', 'Subscribers'], ['/admin/newsletter', 'Newsletter']] },
]

const under = (path: string, href: string) => href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/')

function activeTab(path: string) {
  const extra: Record<string, string> = { '/admin/platforms': 'Imports', '/admin/today': 'Today' }
  const byExtra = Object.entries(extra).find(([p]) => under(path, p))?.[1]
  return TABS.find(t => t.label === byExtra) ?? TABS.find(t => t.pages.some(([href]) => under(path, href))) ?? TABS[0]
}

export default function AdminNav() {
  const path = usePathname() ?? '/admin'
  if (path.startsWith('/admin/login')) return null
  const tab = activeTab(path)
  const page = [...tab.pages].sort((a, b) => b[0].length - a[0].length).find(([href]) => under(path, href))?.[0]
  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-3 flex items-center gap-1 overflow-x-auto">
        <Link href="/admin" className="font-extrabold text-sm pr-3 py-3 shrink-0">Admin</Link>
        {TABS.map(t => (
          <Link key={t.label} href={t.href} className={`shrink-0 text-sm font-semibold px-3 py-3 border-b-2 ${t === tab ? 'border-white' : 'border-transparent text-slate-300 hover:text-white'}`}>{t.label}</Link>
        ))}
        <Link href="/" className="shrink-0 ml-auto text-xs text-slate-400 hover:text-white py-3 pl-3">View site</Link>
      </div>
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 flex gap-1 overflow-x-auto">
          {tab.pages.map(([href, label]) => (
            <Link key={href} href={href} className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-full my-1.5 ${href === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
