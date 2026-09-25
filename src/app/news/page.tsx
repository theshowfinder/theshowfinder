export const revalidate = 3600

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { groupEventsByArtist, fmtOnSaleLabel, type OnSaleGroup } from '@/lib/on-sale'
import type { EventWithVenue, Artist } from '@/lib/types/database'

export const metadata: Metadata = {
  title:       'Latest News — Tour Announcements & On-Sale Dates',
  description: 'The latest UK concert, theatre, comedy and sports ticket news — presale windows, on-sale dates and tour announcements as they happen.',
  alternates:  { canonical: 'https://www.theshowfinder.com/news' },
  openGraph: {
    title:       'Latest News | TheShowFinder',
    description: 'The latest UK concert, theatre, comedy and sports ticket news — presale windows, on-sale dates and tour announcements as they happen.',
    url:         'https://www.theshowfinder.com/news',
  },
}

type NewsStatus = 'live' | 'presale' | 'upcoming'

function newsStatus(group: OnSaleGroup, now: Date): NewsStatus {
  const date = new Date(group.onsale_date)
  if (date.getTime() <= now.getTime()) return 'live'
  return group.saleType === 'presale' ? 'presale' : 'upcoming'
}

const statusMeta: Record<NewsStatus, { label: string; bg: string }> = {
  live:     { label: 'On Sale Now',    bg: '#026CDF' },
  presale:  { label: 'Presale',        bg: '#E8003D' },
  upcoming: { label: 'On Sale Soon',   bg: '#1A1A2E' },
}

export default async function NewsPage() {
  const supabase   = await createClient()
  const now        = new Date()
  const windowFrom = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)
  const windowTo   = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const fromISO    = windowFrom.toISOString()
  const toISO      = windowTo.toISOString()

  // Same underlying signal as On Sale This Week (public_onsale_start /
  // presale_start on events_with_venue — the on_sale_this_week /
  // presale_this_week flag columns aren't reliably kept in sync), just a
  // much wider rolling window so this reads as a proper news feed rather
  // than a single week's snapshot.
  const [eventsResult, artistsResult] = await Promise.all([
    supabase
      .from('events_with_venue')
      .select('*')
      .or(`and(public_onsale_start.gte.${fromISO},public_onsale_start.lte.${toISO}),and(presale_start.gte.${fromISO},presale_start.lte.${toISO})`)
      .order('onsale_date', { ascending: true })
      .limit(500) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase
      .from('artists')
      .select('*') as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const groups = groupEventsByArtist(eventsResult.data ?? [], artistsResult.data ?? [])
    .sort((a, b) => {
      const da = Math.abs(new Date(a.onsale_date).getTime() - now.getTime())
      const db = Math.abs(new Date(b.onsale_date).getTime() - now.getTime())
      return da - db
    })

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div style={{ backgroundColor: '#1A1A2E' }} className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: '#026CDF' }}>
            Ticket news
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Latest News
          </h1>
          <p className="text-white/60 text-base max-w-2xl">
            Presale windows, on-sale dates and tour announcements for UK concerts, theatre, comedy and sports — updated daily.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {groups.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">📰</p>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">No news right now</h2>
            <p className="text-slate-500 mb-8">Check back soon — new on-sale dates are added daily.</p>
            <Link
              href="/events"
              className="inline-block px-6 py-3 rounded-xl font-bold text-white text-sm"
              style={{ backgroundColor: '#E8003D' }}
            >
              Browse all events →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-6">
              {groups.length} act{groups.length !== 1 ? 's' : ''} in the news
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groups.map(group => (
                <NewsCard key={group.slug} group={group} now={now} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function NewsCard({ group, now }: { group: OnSaleGroup; now: Date }) {
  const status      = newsStatus(group, now)
  const meta        = statusMeta[status]
  const onSaleLabel = fmtOnSaleLabel(group.onsale_date)
  const datesCount  = group.events.length

  const headline = status === 'live'
    ? `${group.artistName} tickets on sale now`
    : status === 'presale'
      ? `${group.artistName} presale opens ${onSaleLabel}`
      : `${group.artistName} on sale ${onSaleLabel}`

  return (
    <Link
      href={`/on-sale-this-week/${group.slug}`}
      className="group block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="relative h-48 overflow-hidden bg-slate-900">
        {group.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.image_url}
            alt={group.artistName}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A1A2E, #E8003D)' }}>
            <span className="text-5xl">🎤</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="text-xs font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-full" style={{ backgroundColor: meta.bg }}>
            {meta.label}
          </span>
        </div>
      </div>

      <div className="p-4">
        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
          {group.dbArtist?.tour_name ?? 'Live Tour'}
        </p>
        <h3 className="font-extrabold text-slate-900 text-base leading-tight mb-2 group-hover:text-red-600 transition-colors">
          {headline}
        </h3>
        {datesCount > 0 && (
          <p className="text-sm text-slate-500">
            🗓 {datesCount} UK date{datesCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </Link>
  )
}
