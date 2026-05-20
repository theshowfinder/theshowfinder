export const revalidate = 3600

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { groupEventsByArtist, fmtOnSaleLabel } from '@/lib/on-sale'
import type { EventWithVenue, Artist } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'On Sale This Week | TheShowFinder',
  description: 'Events whose tickets go on sale in the next 7 days across the UK.',
}

export default async function OnSaleThisWeekPage() {
  const supabase  = await createClient()
  const now       = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const nowISO    = now.toISOString()
  const weekISO   = weekAhead.toISOString()

  const [eventsResult, artistsResult] = await Promise.all([
    supabase
      .from('events_with_venue')
      .select('*')
      .gte('onsale_date', nowISO)
      .lte('onsale_date', weekISO)
      .order('onsale_date', { ascending: true })
      .limit(500) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase
      .from('artists')
      .select('*') as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const groups = groupEventsByArtist(eventsResult.data ?? [], artistsResult.data ?? [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>

      {/* Header */}
      <div style={{ backgroundColor: '#1A1A2E' }} className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: '#026CDF' }}>
            Tickets just released
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            On Sale This Week
          </h1>
          <p className="text-white/60 text-base">
            Tickets going on sale between today and{' '}
            {weekAhead.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.
          </p>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {groups.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">🎟️</p>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Nothing on sale right now</h2>
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
              {groups.length} act{groups.length !== 1 ? 's' : ''} going on sale this week
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groups.map(group => (
                <OnSaleCard key={group.slug} group={group} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OnSaleCard({ group }: { group: ReturnType<typeof groupEventsByArtist>[number] }) {
  const onSaleLabel = fmtOnSaleLabel(group.onsale_date)
  const datesCount  = group.events.length

  return (
    <Link
      href={`/on-sale-this-week/${group.slug}`}
      className="group block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
    >
      {/* Image */}
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
          <span className="text-xs font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-full" style={{ backgroundColor: '#026CDF' }}>
            On Sale This Week
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
          {group.dbArtist?.tour_name ?? 'Live Tour'}
        </p>
        <h3 className="font-extrabold text-slate-900 text-lg leading-tight mb-2 group-hover:text-red-600 transition-colors">
          {group.artistName}
        </h3>
        {datesCount > 0 && (
          <p className="text-sm text-slate-500 mb-3">
            🗓 {datesCount} UK date{datesCount !== 1 ? 's' : ''}
          </p>
        )}
        <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">
          🎟️ On sale {onSaleLabel}
        </div>
      </div>
    </Link>
  )
}
