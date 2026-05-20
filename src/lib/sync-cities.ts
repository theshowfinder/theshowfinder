/**
 * City-based Ticketmaster sync, run in 3-city chunks by /api/sync-chunk.
 * Kept separate from ticketmaster.ts so the original full sync is untouched.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { EventCategory } from '@/lib/types/database'

type DbClient = ReturnType<typeof createAdminClient>

// ── UK city list (36 cities, exact TM API spellings) ──────────────────────────

export const SYNC_CITIES = [
  'London', 'Manchester', 'Birmingham', 'Glasgow', 'Edinburgh', 'Liverpool',
  'Bristol', 'Leeds', 'Sheffield', 'Newcastle', 'Nottingham', 'Cardiff',
  'Leicester', 'Brighton', 'Southampton', 'Portsmouth', 'Oxford', 'Cambridge',
  'Reading', 'Norwich', 'Hull', 'Derby', 'Coventry', 'Stoke-on-Trent',
  'Wolverhampton', 'Bradford', 'Belfast', 'Aberdeen', 'Dundee', 'Exeter',
  'Plymouth', 'Bournemouth', 'Milton Keynes', 'Swansea', 'York', 'Bath',
] as const

// ── Ticketmaster API types ─────────────────────────────────────────────────────

interface TMPresale {
  name?: string
  startDateTime?: string
  endDateTime?: string
}

interface TMVenue {
  id: string
  name: string
  address?: { line1?: string; line2?: string }
  city?: { name: string }
  postalCode?: string
  location?: { latitude: string; longitude: string }
  url?: string
}

interface TMImage {
  url: string
  ratio?: string
  width?: number
  fallback?: boolean
}

interface TMPriceRange {
  type: string
  currency: string
  min: number
  max: number
}

interface TMClassification {
  segment?: { name: string }
  genre?: { name: string }
  subGenre?: { name: string }
}

interface TMEvent {
  id: string
  name: string
  url?: string
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string }
    status?: { code: string }
  }
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string }
    presales?: TMPresale[]
  }
  images?: TMImage[]
  priceRanges?: TMPriceRange[]
  classifications?: TMClassification[]
  _embedded?: {
    venues?: TMVenue[]
  }
}

interface TMResponse {
  _embedded?: { events?: TMEvent[] }
  page?: { totalPages: number }
  fault?: { faultstring: string }
  errors?: Array<{ detail: string }>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TM_BASE       = 'https://app.ticketmaster.com/discovery/v2'
const RATE_LIMIT_MS = 250
const MAX_PAGES     = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

function getBestImage(images: TMImage[] | undefined): string | null {
  if (!images?.length) return null
  const ok = (i: TMImage) => !i.fallback
  const standard = images.find(i =>
    ok(i) && i.ratio === '16_9' &&
    i.url.includes('TABLET_LANDSCAPE_16_9') && i.url.endsWith('.jpg')
  )
  if (standard) return standard.url
  const mid = images.find(i =>
    ok(i) && i.ratio === '16_9' &&
    (i.width ?? 0) >= 640 && (i.width ?? 9999) <= 1400 && i.url.endsWith('.jpg')
  )
  if (mid) return mid.url
  const anyJpg = images.find(i => ok(i) && i.ratio === '16_9' && i.url.endsWith('.jpg'))
  if (anyJpg) return anyJpg.url
  const any169 = images.find(i => ok(i) && i.ratio === '16_9')
  if (any169) return any169.url
  return images.find(ok)?.url ?? images[0]?.url ?? null
}

function mapCategory(event: TMEvent): EventCategory {
  const cls      = event.classifications?.[0]
  const seg      = cls?.segment?.name ?? ''
  const genre    = (cls?.genre?.name ?? '').toLowerCase()
  const subGenre = (cls?.subGenre?.name ?? '').toLowerCase()
  if (genre.includes('comedy') || subGenre.includes('comedy')) return 'comedy'
  if (seg === 'Music')          return 'concert'
  if (seg === 'Sports')         return 'sports'
  if (seg === 'Family')         return 'family'
  if (seg === 'Arts & Theatre') return 'theatre'
  return 'concert'
}

function buildStartDate(event: TMEvent): string | null {
  const start = event.dates?.start
  if (!start) return null
  if (start.dateTime) return start.dateTime
  if (start.localDate) return `${start.localDate}T${start.localTime ?? '19:00:00'}`
  return null
}

function mapStatus(event: TMEvent): 'upcoming' | 'on_sale' | 'sold_out' | 'cancelled' | 'postponed' {
  const code = (event.dates?.status?.code ?? '').toLowerCase()
  if (code === 'cancelled') return 'cancelled'
  if (code === 'postponed') return 'postponed'
  if (code === 'offsale')   return 'upcoming'
  if (event.priceRanges?.length) return 'on_sale'
  return 'upcoming'
}

/** Returns the earliest of public sale and any presale start dates. */
function getEarliestOnsaleDate(event: TMEvent): string | null {
  const dates: string[] = []
  const pub = event.sales?.public?.startDateTime
  if (pub) dates.push(pub)
  for (const ps of event.sales?.presales ?? []) {
    if (ps.startDateTime) dates.push(ps.startDateTime)
  }
  if (!dates.length) return null
  return dates.sort()[0]
}

// ── Venue upsert ──────────────────────────────────────────────────────────────

async function upsertVenue(db: DbClient, tmVenue: TMVenue): Promise<string | null> {
  if (!tmVenue.name) return null
  const city     = tmVenue.city?.name ?? 'Unknown'
  const baseSlug = slugify(`${tmVenue.name}-${city}`)

  const { data: byTmId } = await db
    .from('venues')
    .select('id')
    .eq('ticketmaster_id', tmVenue.id)
    .maybeSingle()
  if (byTmId) return byTmId.id

  const { data: bySlug } = await db
    .from('venues')
    .select('id')
    .eq('slug', baseSlug)
    .maybeSingle()
  if (bySlug) {
    await db.from('venues').update({ ticketmaster_id: tmVenue.id }).eq('id', bySlug.id)
    return bySlug.id
  }

  const venueData = {
    name:            tmVenue.name,
    slug:            baseSlug,
    address:         tmVenue.address?.line1 ?? tmVenue.address?.line2 ?? 'See venue website',
    city,
    postcode:        tmVenue.postalCode ?? '',
    country:         'GB',
    lat:             tmVenue.location?.latitude  ? parseFloat(tmVenue.location.latitude)  : null,
    lng:             tmVenue.location?.longitude ? parseFloat(tmVenue.location.longitude) : null,
    website:         tmVenue.url ?? null,
    ticketmaster_id: tmVenue.id,
  }

  const { data, error } = await db.from('venues').insert(venueData).select('id').single()
  if (error) {
    if (error.code === '23505') {
      const fallbackSlug = `${baseSlug}-${tmVenue.id.slice(-6)}`
      const { data: retry } = await db
        .from('venues')
        .insert({ ...venueData, slug: fallbackSlug })
        .select('id')
        .single()
      return retry?.id ?? null
    }
    return null
  }
  return data?.id ?? null
}

// ── Event upsert ──────────────────────────────────────────────────────────────

async function upsertEvent(db: DbClient, tmEvent: TMEvent, venueId: string): Promise<boolean> {
  const startDate = buildStartDate(tmEvent)
  if (!startDate) return false

  const price = tmEvent.priceRanges?.find(p => p.type === 'standard') ?? tmEvent.priceRanges?.[0]
  const slug  = `${slugify(tmEvent.name)}-${tmEvent.id.slice(-8)}`

  const eventData = {
    title:           tmEvent.name,
    slug,
    category:        mapCategory(tmEvent),
    venue_id:        venueId,
    start_date:      startDate,
    onsale_date:     getEarliestOnsaleDate(tmEvent),
    image_url:       getBestImage(tmEvent.images),
    price_from:      price?.min  ?? null,
    price_to:        price?.max  ?? null,
    currency:        price?.currency ?? 'GBP',
    tickets_url:     tmEvent.url ?? null,
    status:          mapStatus(tmEvent),
    is_featured:     false,
    ticketmaster_id: tmEvent.id,
  }

  const { error } = await db
    .from('events')
    .upsert(eventData, { onConflict: 'ticketmaster_id' })

  return !error
}

// ── City page fetch ───────────────────────────────────────────────────────────

async function fetchCityPage(
  city: string,
  page: number,
): Promise<{ events: TMEvent[]; totalPages: number }> {
  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + 1)
  const endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z')

  const url = new URL(`${TM_BASE}/events.json`)
  url.searchParams.set('apikey',      process.env.TICKETMASTER_API_KEY!)
  url.searchParams.set('countryCode', 'GB')
  url.searchParams.set('city',        city)
  url.searchParams.set('size',        '200')
  url.searchParams.set('page',        String(page))
  url.searchParams.set('locale',      'en-us')
  url.searchParams.set('sort',        'date,asc')
  url.searchParams.set('endDateTime', endDateTime)

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) return { events: [], totalPages: 0 }
    const json: TMResponse = await res.json()
    if (json.fault || json.errors?.length) return { events: [], totalPages: 0 }
    return {
      events:     json._embedded?.events ?? [],
      totalPages: json.page?.totalPages  ?? 0,
    }
  } catch {
    return { events: [], totalPages: 0 }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CityBatchResult {
  city:   string
  count:  number
  status: 'ok' | 'error'
  error?: string
}

export async function syncCityBatch(cities: string[]): Promise<CityBatchResult[]> {
  const db      = createAdminClient()
  const results: CityBatchResult[] = []

  for (const city of cities) {
    let count       = 0
    let totalPages  = 1
    let batchError: string | undefined

    try {
      for (let page = 0; page < totalPages && page < MAX_PAGES; page++) {
        const { events, totalPages: tp } = await fetchCityPage(city, page)
        totalPages = tp || 1

        for (const tmEvent of events) {
          const tmVenue = tmEvent._embedded?.venues?.[0]
          if (!tmVenue) continue
          const venueId = await upsertVenue(db, tmVenue)
          if (!venueId) continue
          const ok = await upsertEvent(db, tmEvent, venueId)
          if (ok) count++
        }

        if (page + 1 < totalPages && page + 1 < MAX_PAGES) await sleep(RATE_LIMIT_MS)
      }
    } catch (e) {
      batchError = e instanceof Error ? e.message : String(e)
    }

    results.push({ city, count, status: batchError ? 'error' : 'ok', error: batchError })
    await sleep(RATE_LIMIT_MS)
  }

  return results
}
