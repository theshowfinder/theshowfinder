import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { CITIES } from '@/lib/cities'
import { citySearchUrl, organiserUrl, listedEvents, organiserProfile, isReadableWebsite, socialFromWebsite, type ListedEvent } from '@/lib/eventbriteOrganisers'
import { fetchHtml, readSiteContact } from '@/lib/siteContact'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Finds people who sell event tickets in our cities (Chris, 17 Nov 2026), to offer them free listings and tickets.
// Each weekday run: (1) reads the next cities' public Eventbrite listings and notes every organiser, the towns
// they run events in and how many; (2) reads new organisers' public profiles for their own website and socials;
// (3) reads their own website for a general contact email and their company (Companies House). Results are in
// organiser_prospects and on /admin/organisers. Requests to Eventbrite are spaced out. ?dry=1 reports without
// writing; ?city=Derby searches one city.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const BOT_UA = 'TheShowFinderBot/1.0 (+https://www.theshowfinder.com/list-your-event; partners@theshowfinder.com)'
const CITIES_PER_RUN = 2
const PAGES_PER_CITY = 4
const PROFILES_PER_RUN = 30
const SITES_PER_RUN = 16
const RESEARCH_AFTER_DAYS = 6
const GAP_MS = 1500
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const started = Date.now()
  const left = () => 270_000 - (Date.now() - started)
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  const db = createAdminClient() as Loose
  const cityNames = CITIES.map(c => c.name)

  // 1. Search: cities never searched first (biggest first), then the longest ago, once a week at most.
  const forced = params.get('city')
  const { data: log } = await db.from('organiser_search_log').select('city, searched_at')
  const lastSearched = new Map<string, number>(((log ?? []) as Array<{ city: string; searched_at: string }>).map(r => [r.city, Date.parse(r.searched_at)]))
  const due = forced
    ? [cityNames.find(c => c.toLowerCase() === forced.toLowerCase()) ?? forced]
    : [...cityNames.filter(c => !lastSearched.has(c)),
       ...cityNames.filter(c => lastSearched.has(c) && (lastSearched.get(c) ?? 0) < Date.now() - RESEARCH_AFTER_DAYS * 86_400_000)
         .sort((a, b) => (lastSearched.get(a) ?? 0) - (lastSearched.get(b) ?? 0))].slice(0, CITIES_PER_RUN)

  type Seen = { city: string; towns: Set<string>; events: number; sample: ListedEvent; next: string | null }
  const seen = new Map<string, Seen>()
  const searched: Array<{ city: string; pages: number; organisers: number; blocked?: boolean }> = []
  for (const city of due) {
    let pages = 0, blocked = false
    const before = seen.size
    for (let page = 1; page <= PAGES_PER_CITY && left() > 150_000; page++) {
      const html = await fetchHtml(citySearchUrl(city, page), BROWSER_UA, 15_000)
      await sleep(GAP_MS)
      if (!html) { blocked = page === 1; break }
      const { events, pageCount } = listedEvents(html)
      pages++
      for (const e of events) {
        const s = seen.get(e.organiserId) ?? { city, towns: new Set<string>(), events: 0, sample: e, next: e.startDate }
        s.events++
        if (e.town) s.towns.add(e.town)
        if (e.startDate && (!s.next || e.startDate < s.next)) { s.next = e.startDate; s.sample = e }
        seen.set(e.organiserId, s)
      }
      if (page >= pageCount) break
    }
    searched.push({ city, pages, organisers: seen.size - before, ...(blocked ? { blocked } : {}) })
    if (!dry && pages > 0) await db.from('organiser_search_log').upsert({ city, searched_at: new Date().toISOString(), pages, organisers: seen.size - before })
  }

  let added = 0, refreshed = 0
  if (!dry && seen.size) {
    const ids = [...seen.keys()]
    const { data: existing } = await db.from('organiser_prospects').select('id, source_id, towns, events_seen').eq('source', 'eventbrite').in('source_id', ids)
    const have = new Map<string, Loose>(((existing ?? []) as Loose[]).map(r => [r.source_id, r]))
    const now = new Date().toISOString()
    const fresh: Loose[] = []
    for (const [id, s] of seen) {
      const old = have.get(id)
      if (old) {
        const towns = [...new Set([...(old.towns ?? []), ...s.towns])].slice(0, 20)
        await db.from('organiser_prospects').update({ towns, events_seen: Math.max(old.events_seen ?? 0, s.events), last_seen_at: now, next_event_date: s.next, sample_event: s.sample.title, sample_event_url: s.sample.url, sample_venue: s.sample.venueName }).eq('id', old.id)
        refreshed++
      } else {
        fresh.push({ source: 'eventbrite', source_id: id, city: s.city, towns: [...s.towns].slice(0, 20), events_seen: s.events, sample_event: s.sample.title, sample_event_url: s.sample.url, sample_venue: s.sample.venueName, next_event_date: s.next, profile_url: organiserUrl(id) })
      }
    }
    if (fresh.length) { await db.from('organiser_prospects').upsert(fresh, { onConflict: 'source,source_id', ignoreDuplicates: true }); added = fresh.length }
  }

  // 2. Profiles: name, their own website and socials, how many events they have run.
  let profiled = 0
  const { data: toProfile } = await db.from('organiser_prospects').select('id, source_id').eq('source', 'eventbrite').is('profiled_at', null).order('events_seen', { ascending: false }).limit(PROFILES_PER_RUN)
  for (const r of (toProfile ?? []) as Array<{ id: string; source_id: string }>) {
    if (left() < 90_000) break
    const html = await fetchHtml(organiserUrl(r.source_id), BROWSER_UA, 12_000)
    await sleep(GAP_MS)
    const p = html ? organiserProfile(html) : null
    if (dry) { profiled++; continue }
    if (!html) continue   // try again next run
    const social = socialFromWebsite(p?.website)
    await db.from('organiser_prospects').update(p ? {
      name: p.name, profile_url: p.profileUrl ?? organiserUrl(r.source_id), website: p.website,
      facebook: p.facebook ?? social.facebook ?? null, instagram: p.instagram ?? social.instagram ?? null, twitter: p.twitter,
      total_events: p.totalEvents, attendees_hosted: p.attendeesHosted, profiled_at: new Date().toISOString(),
    } : { profiled_at: new Date().toISOString(), contact_route: 'none', checked_at: new Date().toISOString(), notes: 'Profile could not be read' }).eq('id', r.id)
    profiled++
  }

  // 3. Their own website: a general contact email, a phone number and the company behind it.
  const tally: Record<string, number> = {}
  const { data: toCheck } = await db.from('organiser_prospects').select('id, city, name, website, facebook, instagram').not('profiled_at', 'is', null).is('checked_at', null).order('events_seen', { ascending: false }).limit(SITES_PER_RUN)
  const work = async (r: Loose) => {
    if (left() < 30_000) return
    const readable = isReadableWebsite(r.website)
    const c = readable ? await readSiteContact(r.website, r.city, BOT_UA) : null
    const route = c?.email ? 'email' : (r.instagram || r.facebook) ? 'social' : 'none'
    tally[route] = (tally[route] ?? 0) + 1
    if (dry) return
    await db.from('organiser_prospects').update({
      email: c?.email ?? null, phone: c?.phone ?? null,
      company_number: c?.company?.number ?? c?.companyNumbers[0] ?? null, company_name: c?.company?.name ?? c?.companyNames[0] ?? null,
      company_type: c?.company ? 'ltd' : c?.email ? 'unconfirmed' : 'unknown',
      contact_route: route, checked_at: new Date().toISOString(),
      notes: !readable ? (r.website ? 'Website is a social or ticket page' : 'No website on their profile') : !c?.reached ? 'Website did not load' : null,
    }).eq('id', r.id)
  }
  const list = (toCheck ?? []) as Loose[]
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(work))

  const blockedAll = searched.length > 0 && searched.every(s => s.blocked)
  return NextResponse.json({
    success: !blockedAll, dry, searched, organisersSeen: seen.size, added, refreshed, profiled, checked: list.length, contactRoutes: tally,
    ...(blockedAll ? { note: 'Eventbrite listings did not load (blocked or changed)' } : {}),
  }, { status: blockedAll ? 502 : 200 })
}

export const GET = withJobRun('organiser-find', handleGet)
