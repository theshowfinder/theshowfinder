// Paginated + banded on-sale-soon sync (3-day lookback + 14-day lookahead)
// Uses startDateTime + endDateTime bands (3-week intervals) so each band
// stays under TM's 1200-event page cap (pages 0-5 × 200).
// All DB operations are batched.
// Run with: node scripts/test-onsale-sync.mjs

import { createClient } from '@supabase/supabase-js'

const TM_BASE  = 'https://app.ticketmaster.com/discovery/v2'
const TM_KEY   = process.env.TICKETMASTER_API_KEY
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!TM_KEY || !SUPA_URL || !SUPA_KEY) {
  console.error('Missing required env vars: TICKETMASTER_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const CLASSIFICATIONS = [
  { classificationName: 'music',          dbCategory: 'concert' },
  { classificationName: 'arts & theatre', dbCategory: 'theatre' },
  { classificationName: 'sports',         dbCategory: 'sports'  },
  { classificationName: 'family',         dbCategory: 'family'  },
  { classificationName: 'comedy',         dbCategory: 'comedy'  },
]

const CHECK_ARTISTS = ['Daniel Caesar', 'Tove Lo', 'Katseye', 'Morrissey', 'Beartooth', 'Green Lung', 'Donny Osmond']

const BAND_DAYS = 21   // 3-week show-date bands
const BANDS     = 18   // covers ~12.5 months of show dates
const BATCH    = 400   // rows per DB upsert call
const IN_BATCH = 200   // IDs per .in() clause

const db = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/[\s_]+/g,'-').replace(/-{2,}/g,'-').replace(/^-|-$/g,'').substring(0,80)
}
function getBestImage(images) {
  if (!images?.length) return null
  const ok = i => !i.fallback
  return images.find(i => ok(i) && i.ratio==='16_9' && i.url.includes('TABLET_LANDSCAPE_16_9') && i.url.endsWith('.jpg'))?.url
      ?? images.find(i => ok(i) && i.ratio==='16_9' && (i.width??0)>=640 && (i.width??9999)<=1400 && i.url.endsWith('.jpg'))?.url
      ?? images.find(i => ok(i) && i.ratio==='16_9')?.url
      ?? images.find(ok)?.url ?? images[0]?.url ?? null
}
function earliestOnSaleDate(ev) {
  const dates = []
  if (ev.sales?.public?.startDateTime) dates.push(ev.sales.public.startDateTime)
  for (const p of ev.sales?.presales ?? []) if (p.startDateTime) dates.push(p.startDateTime)
  return dates.length ? dates.reduce((a,b) => a<b?a:b) : null
}
function mapCategory(ev, def) {
  const cls = ev.classifications?.[0]
  const seg = cls?.segment?.name ?? ''
  const genre = (cls?.genre?.name ?? '').toLowerCase()
  const sub = (cls?.subGenre?.name ?? '').toLowerCase()
  if (genre.includes('comedy')||sub.includes('comedy')) return 'comedy'
  if (seg==='Music') return 'concert'
  if (seg==='Sports') return 'sports'
  if (seg==='Family') return 'family'
  if (seg==='Arts & Theatre') return 'theatre'
  return def
}
function mapStatus(ev) {
  const code = (ev.dates?.status?.code ?? '').toLowerCase()
  if (code==='cancelled') return 'cancelled'
  if (code==='postponed') return 'postponed'
  if (code==='offsale') return 'upcoming'
  if (ev.priceRanges?.length) return 'on_sale'
  return 'upcoming'
}
function chunks(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function fmt(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z') }

// ── Build show-date bands ─────────────────────────────────────────────────────
// 3-week (21-day) bands covering ~12.5 months of show dates.
// Each band stays under TM's 1200-event/6-page cap for most classifications.

function buildBands(now) {
  const bands = []
  for (let i = 0; i < BANDS; i++) {
    bands.push({
      label: `+${i*BAND_DAYS}d–+${(i+1)*BAND_DAYS}d`,
      start: fmt(new Date(now.getTime() + i       * BAND_DAYS * 86400000)),
      end:   fmt(new Date(now.getTime() + (i + 1) * BAND_DAYS * 86400000)),
    })
  }
  return bands
}

// ── TM API fetch ──────────────────────────────────────────────────────────────

async function fetchPage(onsaleStart, onsaleEnd, classificationName, page, startDT, endDT) {
  const url = new URL(`${TM_BASE}/events.json`)
  url.searchParams.set('apikey', TM_KEY)
  url.searchParams.set('countryCode', 'GB')
  url.searchParams.set('onsaleStartDateTime', onsaleStart)
  url.searchParams.set('onsaleEndDateTime', onsaleEnd)
  url.searchParams.set('classificationName', classificationName)
  url.searchParams.set('size', '200')
  url.searchParams.set('page', String(page))
  url.searchParams.set('locale', 'en-us')
  url.searchParams.set('sort', 'date,asc')
  url.searchParams.set('startDateTime', startDT)
  url.searchParams.set('endDateTime',   endDT)

  const res = await fetch(url.toString())
  if (!res.ok) { console.error(`  HTTP ${res.status} for "${classificationName}" p${page}`); return { events:[], totalPages:0 } }
  const json = await res.json()
  if (json.fault) { console.error('  fault:', json.fault.faultstring); return { events:[], totalPages:0 } }
  return { events: json._embedded?.events ?? [], totalPages: Math.min(json.page?.totalPages ?? 0, 6) }
}

// ── Step 1: fetch all events from TM API ──────────────────────────────────────

async function fetchAllOnSaleEvents(onsaleStart, onsaleEnd, now) {
  const seen = new Set()
  const all  = []
  const bands = buildBands(now)

  for (const { classificationName, dbCategory } of CLASSIFICATIONS) {
    for (const { label, start, end } of bands) {
      let totalPages = 1
      for (let page = 0; page < totalPages; page++) {
        const result = await fetchPage(onsaleStart, onsaleEnd, classificationName, page, start, end)
        totalPages = result.totalPages || 1
        process.stdout.write(`  [${classificationName}/${label}] p${page+1}/${totalPages}: ${result.events.length}\n`)
        if (!result.events.length) break
        for (const ev of result.events) {
          if (!seen.has(ev.id)) { seen.add(ev.id); all.push({ ev, dbCategory }) }
        }
        if (page + 1 < totalPages) await sleep(300)
      }
      await sleep(300)
    }
  }

  return all
}

// ── Step 2: bulk resolve venues ───────────────────────────────────────────────

async function bulkResolveVenues(events) {
  const venueMap = new Map()
  for (const { ev } of events) {
    const v = ev._embedded?.venues?.[0]
    if (v?.id && v.name && !venueMap.has(v.id)) venueMap.set(v.id, v)
  }
  const tmIds = [...venueMap.keys()]
  console.log(`Unique venues: ${tmIds.length}`)

  const existingMap = new Map()
  for (const batch of chunks(tmIds, IN_BATCH)) {
    const { data } = await db.from('venues').select('id, ticketmaster_id').in('ticketmaster_id', batch)
    for (const row of data ?? []) existingMap.set(row.ticketmaster_id, row.id)
  }
  console.log(`Already in DB: ${existingMap.size}`)

  const newRows = []
  for (const [tmId, v] of venueMap) {
    if (existingMap.has(tmId)) continue
    const city = v.city?.name ?? 'Unknown'
    newRows.push({
      name: v.name, slug: slugify(`${v.name}-${city}`),
      address: v.address?.line1 ?? 'See venue website',
      city, postcode: v.postalCode ?? '', country: 'GB',
      lat: v.location?.latitude  ? parseFloat(v.location.latitude)  : null,
      lng: v.location?.longitude ? parseFloat(v.location.longitude) : null,
      website: v.url ?? null, ticketmaster_id: tmId,
    })
  }

  if (newRows.length > 0) {
    console.log(`Inserting ${newRows.length} new venues...`)
    for (const batch of chunks(newRows, BATCH)) {
      const { error } = await db.from('venues').upsert(batch, { onConflict: 'slug', ignoreDuplicates: true })
      if (error) console.error('  venue upsert error:', error.message)
    }
    for (const batch of chunks(newRows.map(r => r.ticketmaster_id), IN_BATCH)) {
      const { data } = await db.from('venues').select('id, ticketmaster_id').in('ticketmaster_id', batch)
      for (const row of data ?? []) existingMap.set(row.ticketmaster_id, row.id)
    }
  }

  return existingMap
}

// ── Step 3: bulk upsert events ────────────────────────────────────────────────

async function bulkUpsertEvents(events, venueIdMap) {
  const rows = []
  let skipped = 0

  for (const { ev, dbCategory } of events) {
    const tmVenue = ev._embedded?.venues?.[0]
    if (!tmVenue?.id) { skipped++; continue }
    const venueId = venueIdMap.get(tmVenue.id)
    if (!venueId) { skipped++; continue }

    const start = ev.dates?.start
    let startDate = null
    if (start?.dateTime) startDate = start.dateTime
    else if (start?.localDate) startDate = `${start.localDate}T${start.localTime ?? '19:00:00'}`
    if (!startDate) { skipped++; continue }

    const price = ev.priceRanges?.find(p => p.type==='standard') ?? ev.priceRanges?.[0]
    rows.push({
      title: ev.name, slug: `${slugify(ev.name)}-${ev.id.slice(-8)}`,
      category: mapCategory(ev, dbCategory), venue_id: venueId,
      start_date: startDate, onsale_date: earliestOnSaleDate(ev),
      image_url: getBestImage(ev.images),
      price_from: price?.min ?? null, price_to: price?.max ?? null,
      currency: price?.currency ?? 'GBP', tickets_url: ev.url ?? null,
      status: mapStatus(ev), is_featured: false, ticketmaster_id: ev.id,
    })
  }

  console.log(`Upserting ${rows.length} events in batches of ${BATCH} (skipped ${skipped})...`)
  let errors = 0
  for (const [i, batch] of chunks(rows, BATCH).entries()) {
    const { error } = await db.from('events').upsert(batch, { onConflict: 'ticketmaster_id' })
    if (error) { console.error(`  batch ${i+1} error: ${error.message}`); errors++ }
    else process.stdout.write(`  batch ${i+1}/${Math.ceil(rows.length/BATCH)} ✓\n`)
  }
  return { attempted: rows.length, errors, skipped }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const t0  = Date.now()
  const now = new Date()
  const onsaleStart = fmt(new Date(now.getTime() - 3  * 24 * 60 * 60 * 1000))
  const onsaleEnd   = fmt(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000))

  console.log(`\n── Step 1: Fetch from Ticketmaster API ──────────────────────────────`)
  console.log(`On-sale window: ${onsaleStart} → ${onsaleEnd}`)
  console.log(`Show-date bands: ${BANDS} × ${BAND_DAYS}-day bands (~${Math.round(BANDS*BAND_DAYS/30)} months coverage)`)
  const all = await fetchAllOnSaleEvents(onsaleStart, onsaleEnd, now)
  console.log(`\nTotal unique events from API: ${all.length}`)

  console.log(`\n── Step 2: Resolve venues (bulk) ────────────────────────────────────`)
  const venueIdMap = await bulkResolveVenues(all)

  console.log(`\n── Step 3: Upsert events (bulk) ─────────────────────────────────────`)
  const { attempted, errors, skipped } = await bulkUpsertEvents(all, venueIdMap)

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n── Results ──────────────────────────────────────────────────────────`)
  console.log(`Total API events:    ${all.length}`)
  console.log(`Events upserted:     ${attempted}`)
  console.log(`Skipped (no venue):  ${skipped}`)
  console.log(`Batch errors:        ${errors}`)
  console.log(`Elapsed:             ${elapsed}s`)

  // Count events on sale in next 7 days (3-day lookback window)
  const windowISO = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const week7     = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: onsaleRows } = await db
    .from('events').select('title, onsale_date')
    .gte('onsale_date', windowISO).lte('onsale_date', week7)
    .order('onsale_date')

  const artistNames = (onsaleRows ?? []).map(e =>
    e.title.split(/\s+\|\s+|\s*:\s+|\s+[-–—]\s+|\s+"[^"]+"/)[0].trim()
  )
  const uniqueArtists = [...new Set(artistNames)]
  console.log(`\nEvents on sale this week (incl. 3-day lookback): ${onsaleRows?.length ?? 0}`)
  console.log(`Unique artists: ${uniqueArtists.length}`)

  console.log(`\nChecking for requested artists:`)
  for (const target of CHECK_ARTISTS) {
    const found = uniqueArtists.some(a => a.toLowerCase().includes(target.toLowerCase()))
    if (!found) {
      const { data } = await db.from('events').select('title, onsale_date').ilike('title', `%${target}%`).limit(2)
      const inDb = data?.length > 0
      console.log(`  ${inDb ? '~ (in DB, onsale outside window)' : '✗ NOT IN DB'} ${target}${inDb ? ': ' + data.map(e=>`[${e.onsale_date?.slice(0,10)}]`).join(', ') : ''}`)
    } else {
      console.log(`  ✓ ${target}`)
    }
  }

  console.log(`\nAll artists on sale this week:`)
  for (const a of uniqueArtists) console.log(`  - ${a}`)
}

main().catch(console.error)
