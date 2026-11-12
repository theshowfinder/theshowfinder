import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { fetchAllPages } from '@/lib/pagedFetch'
import { CITIES } from '@/lib/cities'
import { anchorCountFor, isVenueName, looksLikeChain, looksMultiSite, spreadAcrossCities } from '@/lib/outreach'
import {
  extractEmails, pickEmail, extractCompanyNumbers, extractCompanyNames, normCompanyName, isEmailableCompany,
  categoryFromOsm, walkLabel, metresBetween, usefulLinks,
} from '@/lib/outreachFind'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Automatic advertiser prospecting (vercel.json: six runs each weekday morning-to-afternoon). Covers every city
// (12 Nov 2026; it used to work one "city of the day", so a city came round once every eight weeks): each run maps the
// next city not yet searched (biggest first, around its busiest venues: London 20, big cities 10, others 6), finds
// bars, pubs, restaurants, cafes and hotels near them on OpenStreetMap, and reads each one's own
// website (home, contact, privacy, terms) for a general inbox and its company number or registered name. Companies
// House must confirm an ACTIVE company before a business is approved for email (UK PECR: we only cold-email
// companies); anything we cannot confirm is parked as "to check" for a person. Places already looked at are recorded
// in outreach_scanned and never fetched again. ?dry=1 reports without writing. ?city=Leeds picks the city.
const PER_RUN = 40          // websites read per run (about 4 pages each, a few seconds per site)
const CONCURRENCY = 6
const UA = 'TheShowFinderBot/1.0 (+https://www.theshowfinder.com/advertise; partners@theshowfinder.com)'
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

interface Candidate { key: string; city: string; name: string; tags: Record<string, string>; lat: number; lng: number; website: string; venue: string; metres: number; chain: boolean }

async function fetchText(url: string, ms = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(ms) })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) return null
    return (await r.text()).slice(0, 600_000)
  } catch { return null }
}

const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ')

async function companiesHouse(path: string): Promise<Loose | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY
  if (!key) return null
  try {
    const r = await fetch(`https://api.company-information.service.gov.uk${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` }, signal: AbortSignal.timeout(8000),
    })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Confirms the business's company with Companies House: by the number on its site, else by its exact registered name. */
async function verifyCompany(numbers: string[], names: string[], siteText?: string): Promise<{ number: string; name: string } | null> {
  // A number only counts when the company it belongs to is also named on the site, so a stray number (a booking
  // system's, a web designer's) is never taken for the business's own company.
  const onSite = siteText ? normCompanyName(siteText) : null
  for (const n of numbers.slice(0, 3)) {
    const c = await companiesHouse(`/company/${encodeURIComponent(n)}`)
    if (isEmailableCompany(c) && (!onSite || onSite.includes(normCompanyName(c.company_name)))) return { number: c.company_number, name: c.company_name }
  }
  for (const name of names.slice(0, 3)) {
    const s = await companiesHouse(`/search/companies?q=${encodeURIComponent(name)}&items_per_page=5`)
    const hit = (s?.items ?? []).find((i: Loose) => normCompanyName(i.title) === normCompanyName(name) && i.company_status === 'active')
    if (hit) {
      const c = await companiesHouse(`/company/${encodeURIComponent(hit.company_number)}`)
      if (isEmailableCompany(c)) return { number: c.company_number, name: c.company_name }
    }
  }
  return null
}

async function overpass(query: string, rounds = 2): Promise<Loose[]> {
  // Overpass servers are often busy (half the runs on 5-6 Nov found nothing): try three servers, twice round.
  // 9 Nov 2026: overpass-api.de reset connections and kumi / private.coffee timed out, while the maps.mail.ru mirror
  // answered in ~20s, so it goes first; the others stay as fallbacks.
  const servers = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
  for (let round = 0; round < rounds; round++) {
    for (const url of servers) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(14_000) })
        if (r.ok) { const els = (await r.json()).elements ?? []; if (els.length) return els }
      } catch { /* try the next server */ }
    }
    await new Promise(res => setTimeout(res, 5000))
  }
  return []
}

// Fallback when the Overpass servers are down (often, Nov 2026): OpenStreetMap's own place search (Nominatim), up to
// 50 places per type inside a box around the venue, with their website from extratags. Its fair-use rule is one
// request a second, so calls are spaced out.
const NOMINATIM_TYPES: Array<[string, string, string]> = [['pub', 'amenity', 'pub'], ['bar', 'amenity', 'bar'], ['restaurant', 'amenity', 'restaurant'], ['cafe', 'amenity', 'cafe'], ['hotel', 'tourism', 'hotel'], ['guest house', 'tourism', 'guest_house']]
async function nominatimAround(lat: number, lng: number, metres: number): Promise<Loose[]> {
  const dLat = metres / 111_000, dLng = metres / (111_000 * Math.cos(lat * Math.PI / 180))
  const box = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map(n => n.toFixed(5)).join(',')
  const out: Loose[] = []
  for (const [q, key, value] of NOMINATIM_TYPES) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=50&bounded=1&viewbox=${box}&extratags=1`
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (r.ok) {
        for (const x of (await r.json()) as Loose[]) {
          if (x.category !== key || x.type !== value || !x.name) continue
          out.push({ type: x.osm_type, id: x.osm_id, lat: Number(x.lat), lon: Number(x.lon), tags: { name: x.name, [key]: value, ...(x.extratags ?? {}) } })
        }
      }
    } catch { /* next type */ }
    await new Promise(res => setTimeout(res, 1100))
  }
  return out
}

/** A city is searched again this long after its last full search, once its backlog has run low. */
const REMAP_DAYS = 30

async function anchorVenues(db: Loose, city: string, howMany: number) {
  const { data: venues } = await db.from('venues').select('id, name, lat, lng').ilike('city', city).not('lat', 'is', null).limit(300)
  if (!venues?.length) return []
  const { data: evs } = await db.from('events').select('venue_id').in('venue_id', venues.map((v: Loose) => v.id)).gte('start_date', new Date().toISOString()).limit(8000)
  const count = new Map<string, number>()
  for (const e of evs ?? []) count.set(e.venue_id, (count.get(e.venue_id) ?? 0) + 1)
  // A venue named just after the city ("Liverpool") is a placeholder, not a place anyone walks to.
  return venues.filter((v: Loose) => count.get(v.id) && String(v.name).trim().toLowerCase() !== city.toLowerCase()).sort((a: Loose, b: Loose) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)).slice(0, howMany) as Array<{ name: string; lat: number; lng: number }>
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  const db = createAdminClient() as Loose
  const hasKey = Boolean(process.env.COMPANIES_HOUSE_API_KEY)

  // 1. Businesses found before the Companies House key existed: record their company where it can be confirmed.
  let reverified = 0
  if (hasKey && !dry) {
    const { data: parked } = await db.from('outreach_prospects').select('id, notes, company_number').eq('company_type', 'unconfirmed').like('notes', '%[unverified]%').limit(20)
    for (const p of parked ?? []) {
      const nums = p.company_number ? [p.company_number] : []
      const names = (p.notes.match(/names: ([^\]|]+)/)?.[1] ?? '').split(';').map((s: string) => s.trim()).filter(Boolean)
      const ok = await verifyCompany(nums, names)
      const now = new Date().toISOString()
      await db.from('outreach_prospects').update(ok
        ? { company_type: 'ltd', company_number: ok.number, notes: `Companies House: ${ok.name} (${ok.number}), found on their own website`, updated_at: now }
        : { notes: p.notes.replace('[unverified]', '[not confirmed]'), updated_at: now }).eq('id', p.id)
      if (ok) reverified++
    }
  }

  // 2. Candidates. Everything the map search finds is kept in outreach_candidates, so one good map answer feeds many
  //    runs (London found 352 places on 5 Nov but a run reads only PER_RUN sites, and the rest used to be forgotten).
  //    Cities not searched yet are mapped first; when the map services are down, runs carry on with the backlog.
  const cityNames = CITIES.map(c => c.name)
  const forced = params.get('city')
  const forcedCity = forced ? (cityNames.find(c => c.toLowerCase() === forced.toLowerCase()) ?? forced) : null
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
  // Paged: PostgREST returns at most 1000 rows per request, and these tables grow by a few hundred a day.
  const [scannedAll, existing] = await Promise.all([
    fetchAllPages<Loose>((from, to) => db.from('outreach_scanned').select('key, website_host, checked_at').order('key').range(from, to)),
    fetchAllPages<Loose>((from, to) => db.from('outreach_prospects').select('id, email, website, city, status').order('id').range(from, to)),
  ])
  const seenKeys = new Set((scannedAll ?? []).map((s: Loose) => s.key))
  const seenHosts = new Set<string>([...(scannedAll ?? []).map((s: Loose) => s.website_host), ...(existing ?? []).map((p: Loose) => host(p.website ?? ''))].filter(Boolean))
  const seenEmails = new Set((existing ?? []).map((p: Loose) => (p.email ?? '').toLowerCase()))
  // Search progress: "venue:<city>:<venue>" when the places around one venue were collected, "map:<city>" when all of
  // a city's venues were. (Older "run:<city>" keys are from before the backlog was kept and are ignored: those
  // searches' results were never saved, so London, Manchester, Liverpool, Bristol and Cardiff are searched again.)
  const stamp = new Map<string, number>()
  for (const r of (scannedAll ?? []) as Array<{ key: string; checked_at: string }>) if (/^(venue|map):/.test(r.key)) stamp.set(r.key, Date.parse(r.checked_at))
  const fresh = (key: string) => (stamp.get(key) ?? 0) > Date.now() - REMAP_DAYS * 86_400_000
  const markDone = async (key: string, city: string) => {
    stamp.set(key, Date.now())
    if (!dry) await db.from('outreach_scanned').upsert({ key, city, result: 'map', checked_at: new Date().toISOString() })
  }

  const loadBacklog = async () => {
    const data = await fetchAllPages<Loose>((from, to) =>
      db.from('outreach_candidates').select('key, city, name, website, lat, lng, venue, metres, chain, tags').order('key').range(from, to))
    return (data as Array<Candidate & { city: string }>).filter(c => !seenKeys.has(c.key) && !seenHosts.has(host(c.website)))
  }

  let mapNote: string | null = null
  let found = 0
  const mapped: string[] = []
  const runStarted = Date.now()

  // Map the venues of one city not collected yet (or not for REMAP_DAYS), as many as fit in the time left, and add
  // every new place with a website to the backlog. The rest of a big city carries on next run.
  const mapCity = async (target: string, budgetMs: number): Promise<number> => {
    const anchors = await anchorVenues(db, target, anchorCountFor(target, cityNames))
    if (!anchors.length) { mapNote = `${target}: no venues with map positions`; await markDone(`map:${target}`, target); return 0 }
    const todo = anchors.filter(a => !fresh(`venue:${target}:${a.name}`))
    const elements: Loose[] = []
    const seenEl = new Set<string>()
    const mapStarted = Date.now()
    // Overpass first; once it has failed for one venue, every venue uses Nominatim instead (dead Overpass servers
    // would otherwise use up the whole run on one venue). One small query per venue.
    let overpassDown = false
    let venuesDone = 0
    for (const a of todo) {
      if (Date.now() - mapStarted > budgetMs) break   // leave time to read the websites
      let els: Loose[] = []
      if (!overpassDown) {
        const q = `[out:json][timeout:60];(nwr(around:600,${a.lat},${a.lng})[amenity~"^(bar|pub|restaurant|cafe)$"];nwr(around:800,${a.lat},${a.lng})[tourism~"^(hotel|guest_house)$"];);out center tags 300;`
        els = await overpass(q, 1)
        if (!els.length) overpassDown = true
      }
      if (!els.length) els = await nominatimAround(a.lat, a.lng, 700)
      if (!els.length) continue   // both map services failed for this venue: try it again next run
      for (const el of els) {
        const k = `${el.type}/${el.id}`
        if (!seenEl.has(k)) { seenEl.add(k); elements.push(el) }
      }
      await markDone(`venue:${target}:${a.name}`, target)
      venuesDone++
    }
    if (todo.every(a => fresh(`venue:${target}:${a.name}`))) await markDone(`map:${target}`, target)
    if (venuesDone) mapped.push(`${target} (${venuesDone} venue${venuesDone === 1 ? '' : 's'})`)
    if (!elements.length) { if (todo.length && !venuesDone) mapNote = `${target}: map search (Overpass and Nominatim) returned nothing`; return 0 }
    const rows: Loose[] = []
    for (const el of elements) {
      const tags = el.tags ?? {}
      const key = `${el.type}/${el.id}`
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon
      let website = (tags.website ?? tags['contact:website'] ?? '').trim()
      if (!tags.name || !website || lat == null || seenKeys.has(key)) continue
      if (isVenueName(tags.name)) continue   // the venue itself or its own bar
      if (!/^https?:\/\//i.test(website)) website = `https://${website}`
      const h = host(website)
      if (!h || seenHosts.has(h) || /facebook|instagram|google|tripadvisor|booking\.com|opentable|atgtickets|ambassadortheatre/.test(h)) continue
      // Chains (OpenStreetMap brand tag, or a known chain name/site) are kept but looked at after the independents.
      const chain = Boolean(tags.brand || tags['brand:wikidata']) || looksLikeChain({ name: tags.name, website })
      const nearest = anchors.map(a => ({ a, d: metresBetween({ lat, lng }, a) })).sort((x, y) => x.d - y.d)[0]
      rows.push({ key, city: target, name: tags.name, website, lat, lng, venue: nearest.a.name, metres: Math.round(nearest.d), chain, tags })
    }
    if (!dry) for (let i = 0; i < rows.length; i += 200) await db.from('outreach_candidates').upsert(rows.slice(i, i + 200), { onConflict: 'key', ignoreDuplicates: true })
    found += elements.length
    return elements.length
  }

  // 2a. Map: the biggest city not searched yet first (?city= forces one). Once every city has been searched, a city
  //     is searched again after REMAP_DAYS when it has fewer than PER_RUN places left to read.
  let backlog = await loadBacklog()
  const left = new Map<string, number>()
  for (const c of backlog) left.set(c.city, (left.get(c.city) ?? 0) + 1)
  const toMap = forcedCity ? [forcedCity] : [
    ...cityNames.filter(c => !fresh(`map:${c}`) && !stamp.has(`map:${c}`)),
    ...cityNames.filter(c => stamp.has(`map:${c}`) && !fresh(`map:${c}`) && (left.get(c) ?? 0) < PER_RUN),
  ]
  for (const c of toMap) {
    const budget = 130_000 - (Date.now() - runStarted)
    if (budget < 20_000) break
    await mapCity(c, budget)
  }
  if (mapped.length) backlog = await loadBacklog()
  if (forcedCity) backlog = backlog.filter(c => c.city === forcedCity)

  // 2b. Read: take turns between cities, the cities with the fewest businesses waiting to be emailed going first,
  //     so every city gets its share. Within a city, independents before chains, nearest the venue first.
  const queued = new Map<string, number>()
  for (const p of (existing ?? []) as Loose[]) if (p.status === 'approved') queued.set(p.city, (queued.get(p.city) ?? 0) + 1)
  const hostsInBatch = new Set<string>()
  const candidates = backlog.filter(c => { const h = host(c.website); if (hostsInBatch.has(h)) return false; hostsInBatch.add(h); return true })
  candidates.sort((a, b) => Number(a.chain) - Number(b.chain) || a.metres - b.metres)
  const batch = spreadAcrossCities(candidates, PER_RUN, queued)
  const city = forcedCity ?? 'all'
  if (!batch.length) return NextResponse.json({ success: false, city, note: mapNote ?? 'nothing left to check', reverified }, { status: mapNote ? 503 : 200 })

  // 3. Read each website and decide.
  const results: Array<{ name: string; result: string; email?: string }> = []
  const work = async (c: Candidate) => {
    const pages: string[] = []
    const home = await fetchText(c.website)
    if (home) {
      pages.push(home)
      for (const link of usefulLinks(home, c.website)) { const p = await fetchText(link, 6000); if (p) pages.push(p) }
    }
    const html = pages.join('\n')
    const text = textOf(html)
    const email = pickEmail(extractEmails(html), c.website, c.city, c.tags.email ?? c.tags['contact:email'])
    let result: string
    let row: Loose = null
    if (!home && !email) result = 'fetch_failed'
    else if (!email) result = 'no_email'
    else if (seenEmails.has(email)) result = 'duplicate'
    else {
      const group = c.chain || looksLikeChain({ name: c.name, website: c.website, email }) || looksMultiSite(textOf(home ?? ''), c.city)
      const numbers = extractCompanyNumbers(text), names = extractCompanyNames(text)
      const ok = hasKey ? await verifyCompany(numbers, names, text) : null
      // Until the Companies House key is added, the business's own website stating a limited company AND a company
      // number is taken as enough (both are legally required on a company's site); anything less waits for a person.
      const siteStated = !hasKey && numbers.length > 0 && names.length > 0
      // Every business with a real business inbox is emailed (Chris, 5 Nov 2026); company_type records how sure we are.
      result = 'approved'
      const address = [c.tags['addr:housenumber'], c.tags['addr:street'], c.tags['addr:postcode']].filter(Boolean).join(' ') || null
      row = {
        business_name: c.name, category: categoryFromOsm(c.tags), city: c.city, email, website: c.website, address,
        near_venue: c.venue, distance_label: walkLabel(c.metres, c.venue), osm_key: c.key,
        company_type: ok || siteStated ? 'ltd' : 'unconfirmed', status: result, company_number: ok?.number ?? numbers[0] ?? null,
        notes: (group ? '[chain/group] ' : '') + (ok
          ? `Companies House: ${ok.name} (${ok.number}), found on their own website`
          : siteStated
          ? `Their website states ${names[0]}, company no. ${numbers[0]} (not checked with Companies House)`
          : `${hasKey ? '[not confirmed]' : '[unverified]'} Found automatically, company not confirmed. numbers: ${numbers.join(', ') || 'none'} | names: ${names.join('; ') || 'none'}`),
      }
      seenEmails.add(email)
    }
    results.push({ name: c.name, result, email: email ?? undefined })
    if (dry) return
    if (row) await db.from('outreach_prospects').insert(row)
    await db.from('outreach_scanned').upsert({ key: c.key, city: c.city, website_host: host(c.website), result, checked_at: new Date().toISOString() })
  }
  for (let i = 0; i < batch.length; i += CONCURRENCY) await Promise.all(batch.slice(i, i + CONCURRENCY).map(work))

  const tally = results.reduce<Record<string, number>>((t, r) => ({ ...t, [r.result]: (t[r.result] ?? 0) + 1 }), {})
  return NextResponse.json({
    success: true, dry, city, mapped, mapNote, found, backlog: candidates.length, cities: [...new Set(batch.map(b => b.city))],
    checked: batch.length, tally, reverified, companiesHouse: hasKey, results: dry ? results : undefined,
  })
}

export const GET = withJobRun('outreach-find', handleGet)
