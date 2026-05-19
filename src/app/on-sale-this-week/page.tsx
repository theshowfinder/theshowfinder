export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import type { EventWithVenue } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'On Sale This Week',
  description: 'Events whose tickets go on sale in the next 7 days across the UK.',
}

const MAX_RESULTS = 50

export default async function OnSaleThisWeekPage() {
  const supabase = await createClient()
  const now      = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: raw } = await supabase
    .from('events_with_venue')
    .select('*')
    .gte('onsale_date', now.toISOString())
    .lte('onsale_date', weekAhead.toISOString())
    .gte('start_date',  now.toISOString())
    .order('onsale_date', { ascending: true })
    .limit(MAX_RESULTS) as unknown as { data: EventWithVenue[] | null }

  // Deduplicate by event id in case the view surfaces any duplicates
  const seen   = new Set<string>()
  const events = (raw ?? []).filter(e => !seen.has(e.id) && seen.add(e.id))

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
            Events whose tickets go on sale between today and{' '}
            {weekAhead.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.
          </p>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {events.length === 0 ? (
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
              {events.length} event{events.length !== 1 ? 's' : ''} going on sale this week
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {events.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
