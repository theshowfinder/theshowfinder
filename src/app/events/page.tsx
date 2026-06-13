import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import ArtistOnSaleCard from '@/components/ArtistOnSaleCard'
import CategoryPills from '@/components/CategoryPills'
import SearchBar from '@/components/SearchBar'
import Pagination from '@/components/Pagination'
import type { EventWithVenue, Artist } from '@/lib/types/database'
import type { Metadata } from 'next'

interface SearchParams {
  category?: string
  city?: string
  q?: string
  page?: string
}

const BASE_DESCRIPTION = 'Browse thousands of upcoming concerts, theatre shows, comedy and live events across the UK. Compare ticket prices from all major providers.'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp   = await searchParams
  const cat  = sp.category
  const city = sp.city

  const titleParts = [
    cat  ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'All Live Events & Concerts',
    city ? `in ${city}` : 'in the UK',
  ]
  const title = titleParts.join(' ')

  const canonical = city
    ? `https://www.theshowfinder.com/events?city=${encodeURIComponent(city)}`
    : `https://www.theshowfinder.com/events`

  return {
    title,
    description: BASE_DESCRIPTION,
    alternates:  { canonical },
    openGraph:   { title, description: BASE_DESCRIPTION, url: canonical },
  }
}

const PAGE_SIZE = 12

async function CityArtists({ city }: { city: string }) {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // Find featured_onsale artists that have upcoming tour dates in this city
  const { data: allFeatured } = await supabase
    .from('artists')
    .select('id, name, slug, image_url, tour_name, onsale_date')
    .eq('featured_onsale', true) as unknown as { data: Pick<Artist, 'id' | 'name' | 'slug' | 'image_url' | 'tour_name' | 'onsale_date'>[] | null }

  if (!allFeatured?.length) return null

  const { data: tours } = await supabase
    .from('tours')
    .select('id, artist_id')
    .in('artist_id', allFeatured.map(a => a.id)) as unknown as { data: { id: string; artist_id: string }[] | null }

  if (!tours?.length) return null

  const { data: cityDates } = await supabase
    .from('tour_dates')
    .select('tour_id')
    .in('tour_id', tours.map(t => t.id))
    .eq('city', city)
    .gte('date', now) as unknown as { data: { tour_id: string }[] | null }

  if (!cityDates?.length) return null

  const tourToArtist = Object.fromEntries(tours.map(t => [t.id, t.artist_id]))
  const artistsWithDates = new Set(cityDates.map(d => tourToArtist[d.tour_id]).filter(Boolean))
  const cityArtists = allFeatured.filter(a => artistsWithDates.has(a.id))

  if (!cityArtists.length) return null

  // Count upcoming city dates per artist
  const dateCounts: Record<string, number> = {}
  for (const d of cityDates) {
    const aId = tourToArtist[d.tour_id]
    if (aId) dateCounts[aId] = (dateCounts[aId] ?? 0) + 1
  }

  return (
    <div className="mb-10">
      <h2 className="text-lg font-extrabold text-slate-900 mb-4">
        🎟 On Sale Soon in {city}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cityArtists.map(artist => (
          <ArtistOnSaleCard
            key={artist.id}
            name={artist.name}
            slug={artist.slug}
            image_url={artist.image_url}
            tour_name={artist.tour_name}
            onsale_date={artist.onsale_date}
            dates_count={dateCounts[artist.id] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

async function EventsList({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const page     = Number(searchParams.page ?? 1)
  const from     = (page - 1) * PAGE_SIZE
  const to       = from + PAGE_SIZE - 1

  let query = supabase
    .from('events_with_venue')
    .select('*', { count: 'exact' })
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .range(from, to)

  if (searchParams.category) query = query.eq('category', searchParams.category)
  if (searchParams.city)     query = query.eq('venue_city', searchParams.city)
  if (searchParams.q)        query = query.ilike('title', `%${searchParams.q}%`)

  const { data: events, count } = await query

  if (!events?.length) {
    return (
      <div className="text-center py-24">
        <p className="text-6xl mb-4">🎭</p>
        <h3 className="text-xl font-semibold text-slate-700 mb-2">No events found</h3>
        <p className="text-slate-500">Try adjusting your filters or search term.</p>
      </div>
    )
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  function buildHref(p: number) {
    const params = new URLSearchParams()
    if (searchParams.category) params.set('category', searchParams.category)
    if (searchParams.city)     params.set('city',     searchParams.city)
    if (searchParams.q)        params.set('q',        searchParams.q)
    if (p !== 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/events?${qs}` : '/events'
  }

  return (
    <div>
      <p className="text-sm text-slate-500 mb-6">
        {count} event{count !== 1 ? 's' : ''} found
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {(events as EventWithVenue[]).map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  )
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams

  // Redirect pure city browsing to the dedicated city page (unified layout)
  if (sp.city && !sp.category && !sp.q) {
    redirect(`/cities/${encodeURIComponent(sp.city)}`)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      {/* Top bar */}
      <div className="py-10 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-6">
            {sp.category
              ? sp.category.charAt(0).toUpperCase() + sp.category.slice(1)
              : 'All Shows'}
            {sp.city ? ` in ${sp.city}` : ''}
            {sp.q    ? ` — "${sp.q}"` : ''}
          </h1>
          <Suspense>
            <SearchBar />
          </Suspense>
        </div>
      </div>

      {/* Category pills */}
      <div className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Suspense>
            <CategoryPills />
          </Suspense>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {sp.city && (
          <Suspense fallback={null}>
            <CityArtists city={sp.city} />
          </Suspense>
        )}
        <Suspense fallback={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-80 rounded-2xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        }>
          <EventsList searchParams={sp} />
        </Suspense>
      </div>
    </div>
  )
}
