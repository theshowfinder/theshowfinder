import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import ArtistResultCard from '@/components/ArtistResultCard'
import Pagination from '@/components/Pagination'
import { clampPage } from '@/lib/pagination'
import { DIRECTORY_LETTERS, parseLetter, rankArtists, normalizeArtistText, type ArtistListRow } from '@/lib/artistSearch'
import { buildBreadcrumbSchema, jsonLdScript } from '@/lib/jsonld'

// Directory of every artist with upcoming UK shows: search by name, browse A-Z,
// or see who has the most dates. Cached for an hour; search/letter variants are
// computed per request (reading searchParams makes this page dynamic).

const PAGE_SIZE = 48
const COLUMNS = 'id, name, slug, image_url, genre, upcoming_count, next_date'

interface SearchParams { q?: string; letter?: string; page?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams
  const letter = parseLetter(sp.letter)
  const title = letter ? `Artists starting with ${letter} — UK Tour Dates` : 'UK Artists, Tour Dates & Tickets'
  const description = 'Find any artist playing in the UK: search by name or browse A-Z to see every upcoming tour date and find tickets.'
  const canonical = letter ? `https://www.theshowfinder.com/artists?letter=${encodeURIComponent(letter)}` : 'https://www.theshowfinder.com/artists'
  return {
    title,
    description,
    alternates: { canonical },
    // Search result pages are not worth indexing.
    ...(sp.q ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | TheShowFinder`, description, url: canonical, type: 'website' },
  }
}

async function loadArtists(sp: SearchParams): Promise<{ rows: ArtistListRow[]; total: number; page: number; error: boolean }> {
  const supabase = createPublicClient()
  const requested = Number(sp.page ?? 1)
  const page = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1
  const from = (page - 1) * PAGE_SIZE
  const q = (sp.q ?? '').trim().slice(0, 80)
  const letter = parseLetter(sp.letter)

  if (q) {
    // Pull candidates by the first word, then rank in code (handles "n dubz" / "ndubz").
    const token = normalizeArtistText(q).split(' ')[0] ?? ''
    const squashed = normalizeArtistText(q).replace(/ /g, '')
    const term = (token.length >= 2 ? token : squashed).replace(/[%_,()\\]/g, '')
    if (!term) return { rows: [], total: 0, page: 1, error: false }
    const { data, error } = await supabase
      .from('artists_with_upcoming').select(COLUMNS)
      .or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
      .limit(500) as unknown as { data: ArtistListRow[] | null; error: unknown }
    if (error) return { rows: [], total: 0, page: 1, error: true }
    const ranked = rankArtists(q, data ?? [])
    return { rows: ranked.slice(0, PAGE_SIZE), total: Math.min(ranked.length, PAGE_SIZE), page: 1, error: false }
  }

  let query = supabase.from('artists_with_upcoming').select(COLUMNS, { count: 'exact' })
  if (letter === '#') query = query.not('name', 'match', '^[A-Za-z]')
  else if (letter) query = query.ilike('name', `${letter}%`)
  query = letter
    ? query.order('name', { ascending: true })
    : query.order('upcoming_count', { ascending: false }).order('name', { ascending: true })
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1) as unknown as { data: ArtistListRow[] | null; count: number | null; error: unknown }
  if (error) return { rows: [], total: 0, page, error: true }
  return { rows: data ?? [], total: count ?? 0, page, error: false }
}

export default async function ArtistsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 80)
  const letter = parseLetter(sp.letter)
  const { rows, total, page, error } = await loadArtists(sp)
  const totalPages = q ? 1 : Math.ceil(total / PAGE_SIZE)
  const safePage = clampPage(page, totalPages)

  function buildHref(p: number) {
    const params = new URLSearchParams()
    if (letter) params.set('letter', letter)
    if (p !== 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/artists?${qs}` : '/artists'
  }

  const heading = q ? `Artists matching “${q}”` : letter ? `Artists starting with ${letter}` : 'Find an artist'
  const breadcrumb = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: 'Artists', url: 'https://www.theshowfinder.com/artists' },
  ])

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      <div className="py-10 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{heading}</h1>
          <p className="text-white/70 mb-5">Every artist with upcoming UK shows: all their tour dates and ticket prices in one place.</p>
          <form action="/artists" method="get" role="search" className="flex gap-2 max-w-xl">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search for an artist…"
              aria-label="Search artists"
              className="flex-1 min-h-[44px] rounded-xl px-4 text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button type="submit" className="min-h-[44px] px-5 rounded-xl font-bold text-white" style={{ backgroundColor: '#E8003D' }}>Search</button>
          </form>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3">
        <nav aria-label="Browse artists A to Z" className="max-w-7xl mx-auto flex flex-wrap gap-1.5">
          <Link href="/artists" className={`px-3 min-h-[36px] inline-flex items-center rounded-lg text-sm font-bold ${!letter && !q ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Top</Link>
          {DIRECTORY_LETTERS.map(l => (
            <Link
              key={l}
              href={`/artists?letter=${encodeURIComponent(l)}`}
              className={`w-9 min-h-[36px] inline-flex items-center justify-center rounded-lg text-sm font-bold ${letter === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >{l}</Link>
          ))}
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {error ? (
          <p className="text-slate-500 text-center py-16">The artist list is being set up: check back shortly, or use the main search.</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-700 font-semibold mb-2">{q ? `No artists found for “${q}”.` : 'No artists here yet.'}</p>
            <p className="text-slate-500">Try a different spelling, or <Link href={q ? `/events?q=${encodeURIComponent(q)}` : '/events'} className="underline">search all shows</Link>.</p>
          </div>
        ) : (
          <>
            {!q && <p className="text-sm text-slate-500 mb-5">{total.toLocaleString('en-GB')} artist{total !== 1 ? 's' : ''} with upcoming UK shows{letter ? '' : ', most dates first'}.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rows.map(a => <ArtistResultCard key={a.id} artist={a} />)}
            </div>
            {!q && <Pagination currentPage={safePage} totalPages={totalPages} buildHref={buildHref} />}
          </>
        )}
      </div>
    </div>
  )
}
