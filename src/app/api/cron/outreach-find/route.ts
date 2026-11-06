import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { CITIES } from '@/lib/cities'
import { cityOfTheDay, isVenueName, looksLikeChain, looksMultiSite } from '@/lib/outreach'
import {
  extractEmails, pickEmail, extractCompanyNumbers, extractCompanyNames, normCompanyName, isEmailableCompany,
  categoryFromOsm, walkLabel, metresBetween, usefulLinks,
} from '@/lib/outreachFind'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Automatic advertiser prospecting (vercel.json: six runs each weekday morning-to-afternoon). Every run works on the
// city of the day (cityOfTheDay: one city a weekday, Manchester first), finds
// bars, pubs, restaurants, cafes and hotels near its three busiest venues on OpenStreetMap, and reads each one's own
// website (home, contact, privacy, terms) for a general inbox and its company number or registered name. Companies
// House must confirm an ACTIVE company before a business is approved for email (UK PECR: we only cold-email
// companies); anything we cannot confirm is parked as "to check" for a person. Places already looked at are recorded
// in outreach_scanned and never fetched again. ?dry=1 reports without writing. ?city=Leeds picks the city.
const PER_RUN = 40          // websites read per run (about 4 pages each, a few seconds per site)
const CONCURRENCY = 6
const UA = 'TheShowFinderBot/1.0 (+https://www.theshowfinder.com/advertise; partners@theshowfinder.com)'
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

interface Candidate { key: string; name: string; tags: Record<string, string>; lat: number; lng: number; website: string; venue: string; metres: number; chain: boolean }

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

async function overpass(query: string): Promise<Loose[]> {
  // Overpass servers are often busy (half the runs on 5-6 Nov found nothing): try three servers, twice round.
  const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
  for (let round = 0; round < 2; round++) {
    for (const url of servers) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(35_000) })
        if (r.ok) { const els = (await r.json()).elements ?? []; if (els.length) return els }
      } catch { /* try the next server */ }
    }
    await new Promise(res => setTimeout(res, 5000))
  }
  return []
}

function pickCity(forced: string | null): string {
  if (forced) return CITIES.find(c => c.name.toLowerCase() === forced.toLowerCase())?.name ?? forced
  return cityOfTheDay(CITIES.map(c => c.name))
}

async function anchorVenues(db: Loose, city: string) {
  const { data: venues } = await db.from('venues').select('id, name, lat, lng').ilike('city', city).not('lat', 'is', null).limit(300)
  if (!venues?.length) return []
  const { data: evs } = await db.from('events').select('venue_id').in('venue_id', venues.map((v: Loose) => v.id)).gte('start_date', new Date().toISOString()).limit(8000)
  const count = new Map<string, number>()
  for (const e of evs ?? []) count.set(e.venue_id, (count.get(e.venue_id) ?? 0) + 1)
  // A venue named just after the city ("Liverpool") is a placeholder, not a place anyone walks to.
  return venues.filter((v: Loose) => count.get(v.id) && String(v.name).trim().toLowerCase() !== city.toLowerCase()).sort((a: Loose, b: Loose) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)).slice(0, 6) as Array<{ name: string; lat: number; lng: number }>
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

  // 2. The next city: candidates near its busiest venues that nobody has looked at yet.
  const city = pickCity(params.get('city'))
  const anchors = await anchorVenues(db, city)
  if (!anchors.length) return NextResponse.json({ success: true, city, note: 'no venues with map positions', reverified })

  const q = `[out:json][timeout:30];(${anchors.map(a =>
    `nwr(around:600,${a.lat},${a.lng})[amenity~"^(bar|pub|restaurant|cafe)$"][~"^(website|contact:website)$"~"."];nwr(around:800,${a.lat},${a.lng})[tourism~"^(hotel|guest_house)$"][~"^(website|contact:website)$"~"."];`).join('')});out center tags 400;`
  const elements = await overpass(q)
  // Only count the city as looked at when the map search actually answered; otherwise the next run tries again.
  if (!elements.length) return NextResponse.json({ success: false, city, note: 'map search (Overpass) returned nothing: will retry next run', reverified }, { status: 503 })
  if (!dry) await db.from('outreach_scanned').upsert({ key: `run:${city}`, city, result: 'run', checked_at: new Date().toISOString() })

  const [{ data: scanned }, { data: existing }] = await Promise.all([
    db.from('outreach_scanned').select('key, website_host').eq('city', city).limit(5000),
    db.from('outreach_prospects').select('email, website').limit(10000),
  ])
  const seenKeys = new Set((scanned ?? []).map((s: Loose) => s.key))
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
  const seenHosts = new Set<string>([...(scanned ?? []).map((s: Loose) => s.website_host), ...(existing ?? []).map((p: Loose) => host(p.website ?? ''))].filter(Boolean))
  const seenEmails = new Set((existing ?? []).map((p: Loose) => (p.email ?? '').toLowerCase()))

  const candidates: Candidate[] = []
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
    candidates.push({ key, name: tags.name, tags, lat, lng, website, venue: nearest.a.name, metres: nearest.d, chain })
    seenHosts.add(h)
  }
  // Small independents first, then chains; nearest first within each.
  candidates.sort((a, b) => Number(a.chain) - Number(b.chain) || a.metres - b.metres)
  const batch = candidates.slice(0, PER_RUN)

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
    const email = pickEmail(extractEmails(html), c.website, city, c.tags.email ?? c.tags['contact:email'])
    let result: string
    let row: Loose = null
    if (!home && !email) result = 'fetch_failed'
    else if (!email) result = 'no_email'
    else if (seenEmails.has(email)) result = 'duplicate'
    else {
      const group = c.chain || looksLikeChain({ name: c.name, website: c.website, email }) || looksMultiSite(textOf(home ?? ''), city)
      const numbers = extractCompanyNumbers(text), names = extractCompanyNames(text)
      const ok = hasKey ? await verifyCompany(numbers, names, text) : null
      // Until the Companies House key is added, the business's own website stating a limited company AND a company
      // number is taken as enough (both are legally required on a company's site); anything less waits for a person.
      const siteStated = !hasKey && numbers.length > 0 && names.length > 0
      // Every business with a real business inbox is emailed (Chris, 5 Nov 2026); company_type records how sure we are.
      result = 'approved'
      const address = [c.tags['addr:housenumber'], c.tags['addr:street'], c.tags['addr:postcode']].filter(Boolean).join(' ') || null
      row = {
        business_name: c.name, category: categoryFromOsm(c.tags), city, email, website: c.website, address,
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
    await db.from('outreach_scanned').upsert({ key: c.key, city, website_host: host(c.website), result, checked_at: new Date().toISOString() })
  }
  for (let i = 0; i < batch.length; i += CONCURRENCY) await Promise.all(batch.slice(i, i + CONCURRENCY).map(work))

  const tally = results.reduce<Record<string, number>>((t, r) => ({ ...t, [r.result]: (t[r.result] ?? 0) + 1 }), {})
  return NextResponse.json({
    success: true, dry, city, anchors: anchors.map(a => a.name), found: elements.length, newCandidates: candidates.length,
    checked: batch.length, tally, reverified, companiesHouse: hasKey, results: dry ? results : undefined,
  })
}

export const GET = withJobRun('outreach-find', handleGet)
