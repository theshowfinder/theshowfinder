// Gives venues a map position (venues.lat / lng) so show pages can show the local partners within walking distance
// and "4 min walk" labels (src/lib/localPlacements.ts). Ticketmaster usually sends a position; venues created by the
// Gigsberg and council imports, and some Ticketmaster ones, arrive with only an address or a postcode. In order:
//   1. a postcode on the venue                     -> postcodes.io (free, bulk, 100 at a time)
//   2. a postcode inside the written address       -> postcodes.io
//   3. the same venue already positioned           -> copy it ("The OVO Hydro" = "OVO Hydro", same city)
//   4. name + address search                       -> OpenStreetMap Nominatim, 1 request a second, capped per run,
//                                                     kept only if it lands near the city's other venues
// Busiest venues first. Run nightly (vercel.json, /api/cron/geocode-venues) and from /admin/health.
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { metresApart } from '@/lib/localPlacements'

type Db = ReturnType<typeof createAdminClient>
interface VenueRow { id: string; name: string; city: string | null; postcode: string | null; address: string | null; lat: number | null; lng: number | null }
type Point = { lat: number; lng: number }

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i
/** A UK postcode found in free text, tidied to "SE10 0DX". */
export function postcodeIn(text: string | null | undefined): string | null {
  const m = POSTCODE.exec(text ?? '')
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null
}

/** Venue name reduced for matching: "The OVO Hydro, Glasgow" -> "ovo hydro". */
export function venueKey(name: string, city: string | null): string {
  let n = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  n = n.replace(/^the /, '')
  const c = (city ?? '').toLowerCase().trim()
  if (c && n.endsWith(` ${c}`) && n.length > c.length + 3) n = n.slice(0, -c.length - 1).trim()
  return n
}

async function postcodesToPoints(postcodes: string[]): Promise<Map<string, Point>> {
  const out = new Map<string, Point>()
  for (let i = 0; i < postcodes.length; i += 100) {
    const chunk = postcodes.slice(i, i + 100)
    try {
      const res = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postcodes: chunk }), signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const body = await res.json() as { result?: { query: string; result: { latitude: number | null; longitude: number | null } | null }[] }
      for (const r of body.result ?? []) {
        if (r.result && typeof r.result.latitude === 'number' && typeof r.result.longitude === 'number') out.set(r.query.toUpperCase(), { lat: r.result.latitude, lng: r.result.longitude })
      }
    } catch { /* postcodes.io unavailable: try again next run */ }
  }
  return out
}

async function nominatim(query: string): Promise<Point | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=gb&limit=1&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'user-agent': 'TheShowFinder venue locator (https://www.theshowfinder.com)', 'accept-language': 'en-GB' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const [hit] = await res.json() as { lat: string; lon: string }[]
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface GeocodeResult { missing: number; fromPostcode: number; fromAddressPostcode: number; fromSameVenue: number; fromSearch: number; searched: number; rejectedFar: number; stillMissing: number; samples: string[] }

export async function geocodeVenues(opts: { deadlineMs: number; maxSearches?: number; dryRun?: boolean }): Promise<GeocodeResult> {
  const db: Db = createAdminClient()
  const dryRun = opts.dryRun ?? false
  const res: GeocodeResult = { missing: 0, fromPostcode: 0, fromAddressPostcode: 0, fromSameVenue: 0, fromSearch: 0, searched: 0, rejectedFar: 0, stillMissing: 0, samples: [] }

  const all: VenueRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('venues').select('id, name, city, postcode, address, lat, lng').order('id').range(from, from + 999) as unknown as { data: VenueRow[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const missing = all.filter(v => v.lat == null || v.lng == null)
  res.missing = missing.length
  if (!missing.length) return res

  // Busiest first: upcoming live shows per venue.
  const shows = new Map<string, number>()
  const now = new Date().toISOString()
  for (let i = 0; i < missing.length; i += 200) {
    const ids = missing.slice(i, i + 200).map(v => v.id)
    const { data } = await db.from('events').select('venue_id').in('venue_id', ids).gte('start_date', now).in('status', LIVE_EVENT_STATUSES).limit(20000) as unknown as { data: { venue_id: string }[] | null }
    for (const r of data ?? []) shows.set(r.venue_id, (shows.get(r.venue_id) ?? 0) + 1)
  }
  missing.sort((a, b) => (shows.get(b.id) ?? 0) - (shows.get(a.id) ?? 0))

  const found = new Map<string, Point & { postcode?: string }>()
  const note = (v: VenueRow, how: string) => { if (res.samples.length < 25) res.samples.push(`${how}: ${v.name}, ${v.city ?? ''}`) }

  // 1 + 2: postcodes.
  const wanted = new Map<string, { v: VenueRow; pc: string; fromAddress: boolean }>()
  for (const v of missing) {
    const own = postcodeIn(v.postcode)
    const inAddress = own ? null : postcodeIn(v.address)
    const pc = own ?? inAddress
    if (pc) wanted.set(v.id, { v, pc, fromAddress: !own })
  }
  const points = await postcodesToPoints([...new Set([...wanted.values()].map(w => w.pc))])
  for (const { v, pc, fromAddress } of wanted.values()) {
    const p = points.get(pc)
    if (!p) continue
    found.set(v.id, { ...p, ...(fromAddress && !v.postcode ? { postcode: pc } : {}) })
    if (fromAddress) res.fromAddressPostcode++; else res.fromPostcode++
    note(v, fromAddress ? 'address postcode' : 'postcode')
  }

  // 3: the same venue, already positioned, in the same city.
  const positioned = new Map<string, Point>()
  for (const v of all) if (v.lat != null && v.lng != null) positioned.set(`${(v.city ?? '').toLowerCase()}|${venueKey(v.name, v.city)}`, { lat: v.lat, lng: v.lng })
  for (const v of missing) {
    if (found.has(v.id)) continue
    const p = positioned.get(`${(v.city ?? '').toLowerCase()}|${venueKey(v.name, v.city)}`)
    if (p) { found.set(v.id, p); res.fromSameVenue++; note(v, 'same venue') }
  }

  // 4: OpenStreetMap search for the busiest of the rest, kept only if within 40 km of the city's other venues.
  const cityCentre = new Map<string, Point>()
  const byCity = new Map<string, Point[]>()
  for (const v of all) if (v.lat != null && v.lng != null && v.city) { const k = v.city.toLowerCase(); const l = byCity.get(k) ?? []; l.push({ lat: v.lat, lng: v.lng }); byCity.set(k, l) }
  for (const [k, list] of byCity) {
    const lats = list.map(p => p.lat).sort((a, b) => a - b), lngs = list.map(p => p.lng).sort((a, b) => a - b)
    cityCentre.set(k, { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)] })
  }
  const maxSearches = opts.maxSearches ?? 60
  for (const v of missing) {
    if (found.has(v.id) || !(shows.get(v.id) ?? 0)) continue
    if (res.searched >= maxSearches || Date.now() > opts.deadlineMs - 15000) break
    res.searched++
    const query = [v.name, v.address && !v.address.toLowerCase().includes(v.name.toLowerCase()) ? v.address : null, v.city, 'UK'].filter(Boolean).join(', ')
    const p = await nominatim(query)
    await sleep(1100)   // Nominatim usage policy: at most one request a second
    if (!p) continue
    const centre = v.city ? cityCentre.get(v.city.toLowerCase()) : undefined
    if (centre && metresApart(centre, p) > 40_000) { res.rejectedFar++; continue }
    found.set(v.id, p); res.fromSearch++; note(v, 'map search')
  }

  if (!dryRun) {
    for (const [id, p] of found) {
      if (Date.now() > opts.deadlineMs) break
      await db.from('venues').update({ lat: p.lat, lng: p.lng, ...(p.postcode ? { postcode: p.postcode } : {}) }).eq('id', id).is('lat', null)
    }
  }
  res.stillMissing = missing.length - found.size
  return res
}
