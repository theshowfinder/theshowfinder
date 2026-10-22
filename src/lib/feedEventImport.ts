// Automatic import of shows that Gigsberg / See Tickets list but the site does not have (Ticketmaster is the
// base catalogue; these two feeds also hold shows it lacks). Mode lives in feed_import_state:
//   off  = does nothing
//   dry  = finds and counts what it would import, writes nothing
//   live = creates the events (capped per run), each linked to its catalogue row
// gigsberg_mode / see_tickets_mode override it per feed (null = follow mode), so one feed can go live first.
// Order: shows in our 40 cities first, then soonest date first, so the daily cap fills the most useful pages.
// Only shows the matcher has already given a "no match" verdict are candidates: matching comes first, a page is
// created only once we know the show cannot be matched to anything we hold.
// Every candidate passes the duplicate / package / future / venue rules in feedImportRules.ts first. A Gigsberg
// show is also re-checked against Gigsberg's live inventory right before it is published, so no page is ever
// created with a dead ticket route.
import { createAdminClient } from '@/lib/supabase/admin'
import { searchGigsbergAffiliateListings } from '@/lib/gigsbergAffiliate'
import { fallbackEventImage, inferEventCategory } from '@/lib/eventImages'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { CITIES } from '@/lib/cities'
import { cleanFeedDescription, comparableVenue, feedCategory, feedPriceFrom, londonToUtcIso, normalize, overlap, postcodeFrom, resolveFeedCity, skipReason, slugify, type FeedRow, type KnownEvent, type SkipReason } from '@/lib/feedImportRules'

type Mode = 'off' | 'dry' | 'live'

export interface PlatformImportStats {
  candidates: number
  eligible: number
  skipped: Partial<Record<SkipReason | 'no_inventory', number>>
  wouldImport: number
  imported: number
  errors: number
  sample: string[]
}

export interface FeedImportResult {
  /** 'live' when either feed is live; per-feed modes below. */
  mode: Mode
  gigsbergMode: Mode
  seeTicketsMode: Mode
  status: 'disabled' | 'complete' | 'partial'
  maxPerRun: number
  gigsberg: PlatformImportStats
  see_tickets: PlatformImportStats
  durationMs: number
}

const OUR_CITIES = new Set(CITIES.map(c => c.name))
const isOurCity = (city: string | null) => !!city && OUR_CITIES.has(city)

const emptyStats = (): PlatformImportStats => ({ candidates: 0, eligible: 0, skipped: {}, wouldImport: 0, imported: 0, errors: 0, sample: [] })
const bump = (s: PlatformImportStats, key: SkipReason | 'no_inventory') => { s.skipped[key] = (s.skipped[key] ?? 0) + 1 }

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

const londonDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

async function loadKnownEvents(db: Loose): Promise<Map<string, KnownEvent[]>> {
  const byDate = new Map<string, KnownEvent[]>()
  let last: string | null = null
  for (;;) {
    let q = db.from('events').select('id, title, start_date, venue:venues(name, city)').gte('start_date', new Date(Date.now() - 86_400_000).toISOString()).in('status', LIVE_EVENT_STATUSES).order('id', { ascending: true }).limit(1000)
    if (last) q = q.gt('id', last)
    const { data, error } = await q as { data: Array<{ id: string; title: string; start_date: string; venue: { name: string; city: string } | null }> | null; error: { message: string } | null }
    if (error) throw new Error(`Could not read existing events: ${error.message}`)
    const rows = data ?? []
    for (const e of rows) {
      const date = londonDate(e.start_date)
      const list = byDate.get(date) ?? []
      list.push({ title: e.title, date, city: e.venue?.city ?? '', venue: e.venue?.name ?? '' })
      byDate.set(date, list)
    }
    if (rows.length < 1000) break
    last = rows[rows.length - 1].id
  }
  return byDate
}

// Map coordinates for a new venue from its postcode (postcodes.io: free, no key). Lets the city pages' "Around <city>"
// section place it by distance. Any failure just leaves the venue without coordinates.
async function postcodeLocation(postcode: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!postcode) return null
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, { signal: controller.signal })
    if (!res.ok) return null
    const body = await res.json() as { result?: { latitude?: number | null; longitude?: number | null } }
    const lat = body.result?.latitude, lng = body.result?.longitude
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function findOrCreateVenue(db: Loose, venue: string, city: string, address: string | null = null): Promise<string> {
  const slug = slugify(`${venue}-${city}`)
  const { data: bySlug } = await db.from('venues').select('id').eq('slug', slug).maybeSingle()
  if (bySlug?.id) return bySlug.id as string
  // The venue may already exist under a slightly different spelling ("Rock City" vs "Rock City Nottingham"): reuse it.
  const { data: inCity } = await db.from('venues').select('id, name').ilike('city', city).limit(500) as { data: Array<{ id: string; name: string }> | null }
  const want = comparableVenue(venue)
  const hit = (inCity ?? []).find(v => normalize(v.name) === normalize(venue) || (want !== '' && comparableVenue(v.name) === want) || overlap(v.name, venue) >= 0.8)
  if (hit) return hit.id
  const postcode = postcodeFrom(address)
  const where = await postcodeLocation(postcode)
  const { data, error } = await db.from('venues').insert({
    name: venue, slug, address: address ?? `${venue}, ${city}`, postcode: postcode ?? '', city, country: 'GB',
    ...(where ? { lat: where.lat, lng: where.lng } : {}),
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create venue')
  return data.id as string
}

// Links the show to its act, creating the act when we do not have it yet. A new act gets the feed's photo when
// there is one (Gigsberg performer photos), so its artist page is not a blank. Existing acts are never changed.
async function linkArtist(db: Loose, eventId: string, name: string | null, photoForNew: string | null = null): Promise<string | null> {
  const clean = (name ?? '').trim()
  if (clean.length < 2 || clean.length > 80) return null
  const slug = slugify(clean)
  if (!slug) return null
  const { data: existing } = await db.from('artists').select('id, image_url').eq('slug', slug).maybeSingle()
  let id = existing?.id as string | undefined
  if (!id) id = (await db.from('artists').insert({ name: clean, slug, ...(photoForNew ? { image_url: photoForNew } : {}) }).select('id').single()).data?.id
  if (id) await db.from('event_artists').insert({ event_id: eventId, artist_id: id, is_headliner: true, order: 0 })
  return (existing?.image_url as string | null | undefined) ?? null
}

// type_name / sub_type: Gigsberg's own category ("Sport" / "Football"), generated columns (migration 086).
interface GigsbergRow extends FeedRow { id: number; event_time: string | null; performer1: string | null; type_name: string | null; sub_type: string | null; image_url: string | null }
// event_time: the show's local start time from the feed ("19:30"), a generated column (migration 086).
// venue_address: the feed's full address (generated column, migration 086), used to place the show in the right city.
// feed_description / search_price / min_price / max_price: the seller's own text and face-value prices.
interface SeeTicketsRow extends FeedRow { id: string; event_time: string | null; venue_address: string | null; primary_artist: string | null; second_artist: string | null; feed_description: string | null; search_price: string | null; min_price: string | number | null; max_price: string | number | null }

async function createGigsbergEvent(db: Loose, row: GigsbergRow): Promise<string> {
  const venueId = await findOrCreateVenue(db, row.venue!, row.city!)
  const category = feedCategory('gigsberg', row.type_name, row.sub_type) ?? inferEventCategory(row.name)
  const slug = `${slugify(`${row.name}-${row.event_date}-${row.city}`)}-${row.id}`
  const { data: event, error } = await db.from('events').insert({
    title: row.name, slug, description: `Live event in ${row.city}. Check Gigsberg for current ticket availability.`, category, venue_id: venueId,
    start_date: londonToUtcIso(row.event_date!, row.event_time), currency: 'GBP', gigsberg_affiliate_url: row.url, gigsberg_inventory_status: 'available',
    source: 'gigsberg', source_url: row.url, status: 'upcoming',
  }).select('id').single()
  if (error || !event) throw new Error(error?.message ?? 'Could not create event')
  // Picture: our artist's photo, else Gigsberg's performer photo (about 430px wide, fine for cards), else our artwork.
  const feedImage = gigsbergImage(row.image_url)
  const artistImage = await linkArtist(db, event.id, row.performer1, feedImage)
  await db.from('events').update({ image_url: artistImage ?? feedImage ?? fallbackEventImage(category, row.name) }).eq('id', event.id)
  await db.from('gigsberg_catalogue_events').update({ matched_event_id: event.id, match_status: 'approved_new', match_reason: 'Imported automatically from the Gigsberg catalogue', match_checked_at: new Date().toISOString(), image_status: artistImage ? 'artist_image' : feedImage ? 'feed_image' : 'branded_fallback' }).eq('id', row.id)
  return event.id as string
}

// Gigsberg performer photos live on gigsberg.com and redirect to www; store the final address.
function gigsbergImage(url: string | null): string | null {
  if (!url || !/^https:\/\/(www\.)?gigsberg\.com\/files\/images\//i.test(url)) return null
  return url.replace(/^https:\/\/gigsberg\.com\//i, 'https://www.gigsberg.com/')
}

// See Tickets' feed picture is a 70px thumbnail, too small to use: the page shows our artist photo when we have
// one, else our category artwork. Text and face-value prices come from the feed.
async function createSeeTicketsEvent(db: Loose, row: SeeTicketsRow): Promise<string> {
  const venueId = await findOrCreateVenue(db, row.venue!, row.city!, row.venue_address)
  const category = feedCategory('see_tickets', row.genre) ?? inferEventCategory(row.name)
  const slug = `${slugify(`${row.name}-${row.event_date}-${row.city}`)}-${slugify(row.id).slice(0, 24)}`
  const priceFrom = feedPriceFrom(row.min_price, row.search_price)
  const top = feedPriceFrom(row.max_price, null)
  const priceTo = priceFrom != null && top != null && top > priceFrom ? top : null
  const { data: event, error } = await db.from('events').insert({
    title: row.name, slug, category, venue_id: venueId,
    description: cleanFeedDescription(row.feed_description) ?? `Live event in ${row.city}. Check See Tickets for current ticket availability.`,
    price_from: priceFrom, price_to: priceTo,
    start_date: londonToUtcIso(row.event_date!, row.event_time), currency: 'GBP', see_tickets_affiliate_url: row.url,
    source: 'see_tickets', source_url: row.url, status: 'upcoming', image_url: fallbackEventImage(category, row.name),
  }).select('id').single()
  if (error || !event) throw new Error(error?.message ?? 'Could not create event')
  const artistImage = await linkArtist(db, event.id, row.primary_artist || row.second_artist)
  if (artistImage) await db.from('events').update({ image_url: artistImage }).eq('id', event.id)
  await db.from('see_tickets_catalogue_events').update({ matched_event_id: event.id, match_status: 'approved_new', match_reason: 'Imported automatically from the See Tickets feed', match_checked_at: new Date().toISOString() }).eq('id', row.id)
  return event.id as string
}

async function fetchCandidates<T>(db: Loose, table: string, columns: string, from: string, to: string): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select(columns)
      .is('gone_at', null).is('matched_event_id', null).eq('match_status', 'no_match')
      .gt('event_date', from).lte('event_date', to)
      .order('event_date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999) as { data: T[] | null; error: { message: string } | null }
    if (error) throw new Error(`Could not read ${table}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

export async function importFeedEvents(opts: { deadlineMs: number }): Promise<FeedImportResult> {
  const started = Date.now()
  const db = createAdminClient() as Loose
  const { data: state } = await db.from('feed_import_state').select('mode, max_per_run, gigsberg_mode, see_tickets_mode').eq('id', 1).maybeSingle() as { data: { mode: Mode; max_per_run: number; gigsberg_mode: Mode | null; see_tickets_mode: Mode | null } | null }
  const baseMode: Mode = state?.mode ?? 'dry'
  const gMode: Mode = state?.gigsberg_mode ?? baseMode
  const sMode: Mode = state?.see_tickets_mode ?? baseMode
  const mode: Mode = gMode === 'live' || sMode === 'live' ? 'live' : gMode === 'off' && sMode === 'off' ? 'off' : 'dry'
  const maxPerRun = state?.max_per_run ?? 150
  const result: FeedImportResult = { mode, gigsbergMode: gMode, seeTicketsMode: sMode, status: 'complete', maxPerRun, gigsberg: emptyStats(), see_tickets: emptyStats(), durationMs: 0 }
  if (mode === 'off') { result.status = 'disabled'; return result }
  // Our cities first, then soonest (rows arrive sorted by date; the sort is stable).
  const ourCitiesFirst = <T extends FeedRow>(rows: T[]) => rows.sort((a, b) => Number(!isOurCity(a.city)) - Number(!isOurCity(b.city)))

  const today = londonDate(new Date().toISOString())
  const horizon = londonDate(new Date(Date.now() + 24 * 30 * 86_400_000).toISOString())
  const known = await loadKnownEvents(db)
  const sameDay = (date: string) => known.get(date) ?? []
  const remember = (row: FeedRow) => {
    const list = known.get(row.event_date!) ?? []
    list.push({ title: row.name, date: row.event_date!, city: row.city ?? '', venue: row.venue ?? '' })
    known.set(row.event_date!, list)
  }
  const outOfTime = () => Date.now() > opts.deadlineMs

  // Gigsberg
  const g = result.gigsberg
  const gRows = gMode === 'off' ? [] : await fetchCandidates<GigsbergRow>(db, 'gigsberg_catalogue_events', 'id, name, event_date, event_time, venue, city, performer1, type_name, sub_type, image_url, url', today, horizon)
  g.candidates = gRows.length
  // Our city names first (the duplicate check and the city pages both compare cities): see resolveFeedCity.
  for (const r of gRows) r.city = resolveFeedCity(r.city, null)
  ourCitiesFirst(gRows)
  // Each live candidate costs one Gigsberg inventory call; shows with no tickets are re-checked on later runs.
  let inventoryChecks = 0
  for (const row of gRows) {
    if (outOfTime()) { result.status = 'partial'; break }
    const why = skipReason(row, sameDay(row.event_date!), today)
    if (why) { bump(g, why); continue }
    g.eligible++
    if (gMode === 'dry') { g.wouldImport++; if (g.sample.length < 12) g.sample.push(`${row.name} | ${row.venue}, ${row.city} | ${row.event_date}`); remember(row); continue }
    if (g.imported >= maxPerRun || inventoryChecks >= maxPerRun * 3) { result.status = 'partial'; continue }
    try {
      inventoryChecks++
      const inv = await searchGigsbergAffiliateListings({ event_id: Number(row.id), currency_code: 'GBP' })
      await db.from('gigsberg_catalogue_events').update({ inventory_status: inv.total > 0 ? 'available' : 'no_inventory', inventory_checked_at: new Date().toISOString() }).eq('id', row.id)
      if (!(inv.total > 0)) { bump(g, 'no_inventory'); continue }
      await createGigsbergEvent(db, row)
      remember(row); g.imported++
      if (g.sample.length < 12) g.sample.push(`${row.name} | ${row.venue}, ${row.city} | ${row.event_date}`)
    } catch (e) {
      g.errors++
      console.error('[feed-import] gigsberg', row.id, e instanceof Error ? e.message : e)
    }
  }

  // See Tickets
  const s = result.see_tickets
  const sRows = sMode === 'off' ? [] : await fetchCandidates<SeeTicketsRow>(db, 'see_tickets_catalogue_events', 'id, name, event_date, event_time, venue, city, venue_address, genre, primary_artist, second_artist, feed_description, search_price, min_price, max_price, url', today, horizon)
  s.candidates = sRows.length
  for (const r of sRows) r.city = resolveFeedCity(r.city, r.venue_address)
  ourCitiesFirst(sRows)
  for (const row of sRows) {
    if (outOfTime()) { result.status = 'partial'; break }
    const why = skipReason(row, sameDay(row.event_date!), today)
    if (why) { bump(s, why); continue }
    s.eligible++
    if (sMode === 'dry') { s.wouldImport++; if (s.sample.length < 12) s.sample.push(`${row.name} | ${row.venue}, ${row.city} | ${row.event_date}`); remember(row); continue }
    if (s.imported >= maxPerRun) { result.status = 'partial'; continue }
    try {
      await createSeeTicketsEvent(db, row)
      remember(row); s.imported++
      if (s.sample.length < 12) s.sample.push(`${row.name} | ${row.venue}, ${row.city} | ${row.event_date}`)
    } catch (e) {
      s.errors++
      console.error('[feed-import] see_tickets', row.id, e instanceof Error ? e.message : e)
    }
  }

  result.durationMs = Date.now() - started
  await db.from('feed_import_state').update({ last_stats: { at: new Date().toISOString(), ...result } }).eq('id', 1)
  return result
}

/** Manual "create the event page" for one unmatched catalogue row (used by the Unmatched worklist). */
export async function createEventFromCatalogue(platform: 'gigsberg' | 'see_tickets', id: string): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const db = createAdminClient() as Loose
  const table = platform === 'gigsberg' ? 'gigsberg_catalogue_events' : 'see_tickets_catalogue_events'
  const { data: row } = await db.from(table).select('*').eq('id', id).maybeSingle() as { data: (GigsbergRow & SeeTicketsRow & { gone_at: string | null; matched_event_id: string | null }) | null }
  if (!row) return { ok: false, error: 'That listing no longer exists.' }
  if (row.matched_event_id) return { ok: false, error: 'That listing is already linked to a site event.' }
  if (row.gone_at) return { ok: false, error: 'That listing has been removed from the feed.' }
  row.city = resolveFeedCity(row.city, platform === 'see_tickets' ? row.venue_address : null)
  if (!row.venue?.trim() || !row.city?.trim()) return { ok: false, error: 'The feed gives no venue or city for this show, so a page cannot be built. Hide it or link it by hand.' }
  if (!row.event_date || row.event_date < londonDate(new Date().toISOString())) return { ok: false, error: 'That show is in the past.' }
  try {
    let eventId: string
    if (platform === 'gigsberg') {
      const inv = await searchGigsbergAffiliateListings({ event_id: Number(row.id), currency_code: 'GBP' })
      await db.from(table).update({ inventory_status: inv.total > 0 ? 'available' : 'no_inventory', inventory_checked_at: new Date().toISOString() }).eq('id', row.id)
      if (!(inv.total > 0)) return { ok: false, error: 'Gigsberg has no tickets for this show right now, so a page would have a dead button. Not created.' }
      eventId = await createGigsbergEvent(db, row)
    } else {
      eventId = await createSeeTicketsEvent(db, row)
    }
    const { data: ev } = await db.from('events').select('slug').eq('id', eventId).maybeSingle() as { data: { slug: string } | null }
    return { ok: true, slug: ev?.slug ?? '' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
