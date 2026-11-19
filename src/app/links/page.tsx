// theshowfinder.com/links: the one link in our Instagram / TikTok / Facebook bios. Instagram and TikTok
// captions can't carry links and Facebook Pages get 2 link posts a month, so every post says "link in bio"
// and this page lists whatever we are promoting: featured listings first (Admin → Event submissions →
// Feature free, or a paid boost), then what goes on sale this week. Nothing to edit by hand.
// Every link carries utm_source=bio so Google Analytics shows what the bio sends us.
export const revalidate = 600
export const maxDuration = 60

import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { eventImageUrl, cardImageUrl } from '@/lib/eventImages'
import NewsletterInline from '@/components/NewsletterInline'
import type { EventCategory } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'TheShowFinder Links: Featured Events & Tickets',
  description: 'The events we are shouting about right now, what goes on sale this week, and how to list your own event free.',
  alternates: { canonical: 'https://www.theshowfinder.com/links' },
  robots: { index: false, follow: true },
}

type Row = {
  id: string; title: string; slug: string; start_date: string; image_url: string | null; category: string
  venue: { name: string; city: string } | null
}

const UTM = 'utm_source=bio&utm_medium=social&utm_campaign=links'
const withUtm = (path: string) => `${path}${path.includes('?') ? '&' : '?'}${UTM}`

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' })
}

async function load(): Promise<{ featured: Row[]; onSale: Row[] }> {
  const db = createPublicClient()
  const cols = 'id, title, slug, start_date, image_url, category, venue:venues(name, city)'
  const now = new Date().toISOString()
  const [f, o] = await Promise.all([
    db.from('events').select(cols).eq('is_featured', true).gte('start_date', now).is('merged_into', null)
      .order('start_date', { ascending: true }).limit(12) as unknown as Promise<{ data: Row[] | null }>,
    db.from('events').select(cols).eq('on_sale_this_week', true).gte('start_date', now).is('merged_into', null)
      .order('start_date', { ascending: true }).limit(6) as unknown as Promise<{ data: Row[] | null }>,
  ])
  const featured = f.data ?? []
  const seen = new Set(featured.map(e => e.id))
  return { featured, onSale: (o.data ?? []).filter(e => !seen.has(e.id)) }
}

function EventLink({ e, big }: { e: Row; big?: boolean }) {
  const img = cardImageUrl(eventImageUrl(e.image_url, e.category as EventCategory, e.title))
  return (
    <a href={withUtm(`/events/${e.slug}`)} className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-2.5 hover:border-rose-400 transition-colors">
      <div className={`${big ? 'w-24 h-24' : 'w-16 h-16'} flex-none rounded-xl bg-slate-200 bg-cover bg-center`} style={{ backgroundImage: `url(${img})` }} role="img" aria-label={e.title} />
      <div className="min-w-0 flex-1">
        <p className={`font-bold text-slate-900 leading-snug ${big ? 'text-base' : 'text-sm'} line-clamp-2`}>{e.title}</p>
        <p className="text-xs text-slate-500 mt-1">{when(e.start_date)}{e.venue ? ` · ${e.venue.name}, ${e.venue.city}` : ''}</p>
        {big && <p className="text-xs font-bold mt-1.5" style={{ color: '#E8003D' }}>Get tickets →</p>}
      </div>
    </a>
  )
}

const QUICK_LINKS: Array<[string, string]> = [
  ['What’s on this week', '/this-week'],
  ['On sale this week', '/on-sale-this-week'],
  ['New tours just announced', '/new-tours'],
  ['List your event free', '/list-your-event'],
  ['Sell tickets with no fees', '/sell-tickets'],
]

export default async function LinksPage() {
  const { featured, onSale } = await load()
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">TheShowFinder</h1>
          <p className="text-sm text-slate-600">Every UK gig, show and night out, with every place to get tickets.</p>
        </header>

        {featured.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Featured</h2>
            {featured.map(e => <EventLink key={e.id} e={e} big />)}
          </section>
        )}

        {onSale.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">On sale this week</h2>
            {onSale.map(e => <EventLink key={e.id} e={e} />)}
          </section>
        )}

        <section className="space-y-2">
          {QUICK_LINKS.map(([label, href]) => (
            <Link key={href} href={withUtm(href)} className="block text-center font-bold text-white rounded-2xl py-3.5" style={{ backgroundColor: '#E8003D' }}>
              {label}
            </Link>
          ))}
        </section>

        <NewsletterInline source="links" heading="Never miss an on-sale" blurb="New tours and ticket on-sales every week, free." stacked />
      </div>
    </main>
  )
}
