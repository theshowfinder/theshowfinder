import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import ArtistResultCard from '@/components/ArtistResultCard'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { cityPagePath } from '@/lib/cities'
import { tallyCityArtists, pickSimilar, cityShowsLabel, type RelatedArtist } from '@/lib/relatedArtists'

// Artist-tile strips that keep visitors moving between pages. Server components:
// each one runs its own (cached-with-the-page) queries and renders nothing when
// it has nothing useful to show.

const VIEW_COLUMNS = 'id, name, slug, image_url, genre, upcoming_count, next_date'
const DAY = 86400000

function Strip({ title, href, hrefLabel, artists }: { title: string; href?: string; hrefLabel?: string; artists: RelatedArtist[] }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
        {href && <Link href={href} className="text-sm font-semibold underline text-slate-600 whitespace-nowrap">{hrefLabel} →</Link>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {artists.map(a => <ArtistResultCard key={a.id} artist={a} />)}
      </div>
    </section>
  )
}

// Artists with shows in a city over the next 90 days (other than the ones excluded).
export async function ArtistsInCity({ city, excludeArtistIds = [], limit = 6 }: { city: string; excludeArtistIds?: string[]; limit?: number }) {
  const supabase = createPublicClient()
  const now = new Date()
  const { data: events } = await supabase
    .from('listed_events_with_venue').select('id')
    .eq('venue_city', city)
    .gte('start_date', now.toISOString())
    .lte('start_date', new Date(now.getTime() + 90 * DAY).toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .limit(600) as unknown as { data: { id: string }[] | null }
  const ids = (events ?? []).map(e => e.id)
  if (!ids.length) return null

  const links: { artist_id: string; event_id: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('event_artists').select('artist_id, event_id')
      .eq('is_headliner', true)
      .in('event_id', ids.slice(i, i + 200)) as unknown as { data: { artist_id: string; event_id: string }[] | null }
    links.push(...(data ?? []))
  }
  const top = tallyCityArtists(links, excludeArtistIds).slice(0, limit)
  if (!top.length) return null

  const { data: rows } = await supabase
    .from('artists_with_upcoming').select(VIEW_COLUMNS)
    .in('id', top.map(t => t.artistId)) as unknown as { data: RelatedArtist[] | null }
  const byId = new Map((rows ?? []).map(r => [r.id, r]))
  const artists: RelatedArtist[] = []
  for (const t of top) {
    const r = byId.get(t.artistId)
    if (r) artists.push({ ...r, subtitle: cityShowsLabel(t.shows, city) })
  }
  if (artists.length < 2) return null

  const cityHref = cityPagePath(city)
  return <Strip title={`Artists playing in ${city}`} href={cityHref ?? undefined} hrefLabel={`All ${city} shows`} artists={artists} />
}

// "You might also like": same-genre artists with upcoming UK dates, topped up
// with the busiest artists overall.
export async function SimilarArtists({ genre, excludeArtistIds = [], limit = 6, title = 'You might also like' }: { genre?: string | null; excludeArtistIds?: string[]; limit?: number; title?: string }) {
  const supabase = createPublicClient()
  const [same, popular] = await Promise.all([
    genre
      ? supabase.from('artists_with_upcoming').select(VIEW_COLUMNS).eq('genre', genre)
          .order('upcoming_count', { ascending: false }).limit(limit + excludeArtistIds.length + 4) as unknown as Promise<{ data: RelatedArtist[] | null }>
      : Promise.resolve({ data: [] as RelatedArtist[] }),
    supabase.from('artists_with_upcoming').select(VIEW_COLUMNS)
      .order('upcoming_count', { ascending: false }).limit(limit + excludeArtistIds.length + 4) as unknown as Promise<{ data: RelatedArtist[] | null }>,
  ])
  const picked = pickSimilar(same.data ?? [], popular.data ?? [], excludeArtistIds, limit)
  if (picked.length < 2) return null
  return <Strip title={title} href="/artists" hrefLabel="Browse all artists" artists={picked} />
}
