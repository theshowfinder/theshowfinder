export const revalidate = 3600

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ArtistOnSaleCard from '@/components/ArtistOnSaleCard'
import type { Artist } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'On Sale This Week',
  description: 'Events whose tickets go on sale in the next 7 days across the UK.',
}

type EventRow = {
  id: string; title: string; onsale_date: string | null
  tickets_url: string | null; slug: string; start_date: string
  image_url: string | null
}
type ArtistLookup = { id: string; name: string; slug: string; image_url: string | null; tour_name: string | null }
type EventGroup = {
  title: string; count: number; earliest_onsale: string | null
  tickets_url: string | null; image_url: string | null
  artist: ArtistLookup | null
}

export default async function OnSaleThisWeekPage() {
  const supabase = await createClient()
  const now = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const nowISO = now.toISOString()
  const weekISO = weekAhead.toISOString()

  // Manual featured artists (featured_onsale=true AND onsale_date in 7-day window)
  // plus all artists for name→slug lookup
  const [manualResult, allArtistsResult] = await Promise.all([
    supabase
      .from('artists')
      .select('*')
      .eq('featured_onsale', true)
      .gte('onsale_date', nowISO)
      .lte('onsale_date', weekISO)
      .order('onsale_date', { ascending: true }) as unknown as Promise<{ data: Artist[] | null }>,
    supabase
      .from('artists')
      .select('id, name, slug, image_url, tour_name') as unknown as Promise<{ data: ArtistLookup[] | null }>,
  ])

  const manualArtists = manualResult.data ?? []
  const allArtists = allArtistsResult.data ?? []
  const artistByName = new Map(allArtists.map(a => [a.name.toLowerCase(), a]))

  // Tour date counts for manual artists
  const artistDateCounts: Record<string, number> = {}
  if (manualArtists.length) {
    const { data: tours } = await supabase
      .from('tours')
      .select('id, artist_id')
      .in('artist_id', manualArtists.map(a => a.id)) as unknown as { data: { id: string; artist_id: string }[] | null }

    if (tours?.length) {
      const { data: tourDates } = await supabase
        .from('tour_dates')
        .select('tour_id')
        .in('tour_id', tours.map(t => t.id))
        .gte('date', nowISO) as unknown as { data: { tour_id: string }[] | null }

      const tourToArtist = Object.fromEntries((tours ?? []).map(t => [t.id, t.artist_id]))
      for (const d of tourDates ?? []) {
        const aId = tourToArtist[d.tour_id]
        if (aId) artistDateCounts[aId] = (artistDateCounts[aId] ?? 0) + 1
      }
    }
  }

  // Events with onsale_date in the next 7 days
  const evResult = await supabase
    .from('events')
    .select('id, title, onsale_date, tickets_url, slug, start_date, image_url')
    .gte('onsale_date', nowISO)
    .lte('onsale_date', weekISO)
    .gte('start_date', nowISO)
    .order('onsale_date', { ascending: true })
    .limit(500) as unknown as { data: EventRow[] | null }

  let rawEvents: EventRow[] = evResult.data ?? []

  // Fall back to 8 most recently created events if none have onsale_date in range
  if (!rawEvents.length) {
    const fbResult = await supabase
      .from('events')
      .select('id, title, onsale_date, tickets_url, slug, start_date, image_url')
      .order('created_at', { ascending: false })
      .limit(80) as unknown as { data: EventRow[] | null }
    rawEvents = fbResult.data ?? []
  }

  // Group by title — one card per artist
  const groupMap = new Map<string, EventGroup>()
  for (const ev of rawEvents) {
    const key = ev.title.toLowerCase()
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        title: ev.title, count: 1, earliest_onsale: ev.onsale_date,
        tickets_url: ev.tickets_url, image_url: ev.image_url,
        artist: artistByName.get(key) ?? null,
      })
    } else {
      const g = groupMap.get(key)!
      g.count++
      if (ev.onsale_date && (!g.earliest_onsale || ev.onsale_date < g.earliest_onsale)) {
        g.earliest_onsale = ev.onsale_date
      }
    }
  }

  // Remove groups covered by a manual artist card
  const manualNames = new Set(manualArtists.map(a => a.name.toLowerCase()))
  const eventGroups = [...groupMap.values()].filter(g => !manualNames.has(g.title.toLowerCase()))

  const totalCount = manualArtists.length + eventGroups.length

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
        {totalCount === 0 ? (
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
              {totalCount} {totalCount !== 1 ? 'acts' : 'act'} going on sale this week
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {manualArtists.map(artist => (
                <ArtistOnSaleCard
                  key={artist.id}
                  name={artist.name}
                  slug={artist.slug}
                  image_url={artist.image_url}
                  tour_name={artist.tour_name}
                  onsale_date={artist.onsale_date}
                  dates_count={artistDateCounts[artist.id] ?? 0}
                />
              ))}
              {eventGroups.map(g => (
                <ArtistOnSaleCard
                  key={g.title}
                  name={g.title}
                  slug={g.artist?.slug ?? ''}
                  href={g.artist ? undefined : (g.tickets_url ?? undefined)}
                  image_url={g.artist?.image_url ?? g.image_url}
                  tour_name={g.artist?.tour_name ?? null}
                  onsale_date={g.earliest_onsale}
                  dates_count={g.count}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
