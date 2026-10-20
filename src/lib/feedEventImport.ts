// Automatic import of shows that Gigsberg / See Tickets list but the site does not have (Ticketmaster is the
// base catalogue; these two feeds also hold shows it lacks). Mode lives in feed_import_state:
//   off  = does nothing
//   dry  = finds and counts what it would import, writes nothing
//   live = creates the events (capped per run), each linked to its catalogue row
// Only shows the matcher has already given a "no match" verdict are candidates: matching comes first, a page is
// created only once we know the show cannot be matched to anything we hold.
// Every candidate passes the duplicate / package / future / venue rules in feedImportRules.ts first. A Gigsberg
// show is also re-checked against Gigsberg's live inventory right before it is published, so no page is ever
// created with a dead ticket route.
import { createAdminClient } from '@/lib/supabase/admin'
import { searchGigsbergAffiliateListings } from '@/lib/gigsbergAffiliate'
import { fallbackEventImage, inferEventCategory } from '@/lib/eventImages'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { comparableVenue, londonToUtcIso, normalize, overlap, skipReason, slugify, type FeedRow, type KnownEvent, type SkipReason } from '@/lib/feedImportRules'

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
  mode: Mode
  status: 'disabled' | 'complete' | 'partial'
  maxPerRun: number
  gigsberg: PlatformImportStats
  see_tickets: PlatformImportStats
  durationMs: number
}

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

async function findOrCreateVenue(db: Loose, venue: string, city: string): Promise<string> {
  const slug = slugify(`${venue}-${city}`)
  const { data: bySlug } = await db.from('venues').select('id').eq('slug', slug).maybeSingle()
  if (bySlug?.id) return bySlug.id as string
  // The venue may already exist under a slightly different spelling ("Rock City" vs "Rock City Nottingham"): reuse it.
  const { data: inCity } = await db.from('venues').select('id, name').ilike('city', city).limit(500) as { data: Array<{ id: string; name: string }> | null }
  const want = comparableVenue(venue)
  const hit = (inCity ?? []).find(v => normalize(v.name) === normalize(venue) || (want !== '' && comparableVenue(v.name) === want) || overlap(v.name, venue) >= 0.8)
  if (hit) return hit.id
  const { data, error } = await db.from('venues').insert({ name: venue, slug, address: `${venue}, ${city}`, postcode: '', city, country: 'GB' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create venue')
  return data.id as string
}

async function linkArtist(db: Loose, eventId: string, name: string | null): Promise<string | null> {
  const clean = (name ?? '').trim()
  if (clean.length < 2 || clean.length > 80) return null
  const slug = slugify(clean)
  if (!slug) return null
  const { data: existing } = await db.from('artists').select('id, image_url').eq('slug', slug).maybeSingle()
  let id = existing?.id as string | undefined
  if (!id) id = (await db.from('artists').insert({ name: clean, slug }).select('id').single()).data?.id
  if (id) await db.from('event_artists').insert({ event_id: eventId, artist_id: id, is_headliner: true, order: 0 })
  return (existing?.image_url as string | null | undefined) ?? null
}

interface GigsbergRow extends FeedRow { id: number; event_time: string | null; performer1: string | null }
interface SeeTicketsRow extends FeedRow { id: string; primary_artist: string | null; second_artist: string | null }

async function createGigsbergEvent(db: Loose, row: GigsbergRow): Promise<string> {
  const venueId = await findOrCreateVenue(db, row.venue!, row.city!)
  const category = inferEventCategory(row.name)
  const slug = `${slugify(`${row.name}-${row.event_date}-${row.city}`)}-${row.id}`
  const { data: event, error } = await db.from('events').insert({
    title: row.name, slug, description: `Live event in ${row.city}. Check Gigsberg for current ticket availability.`, category, venue_id: venueId,
    start_date: londonToUtcIso(row.event_date!, row.event_time), currency: 'GBP', gigsberg_affiliate_url: row.url, gigsberg_inventory_status: 'available',
    source: 'gigsberg', source_url: row.url, status: 'upcoming',
  }).select('id').single()
  if (error || !event) throw new Error(error?.message ?? 'Could not create event')
  const artistImage = await linkArtist(db, event.id, row.performer1)
  await db.from('events').update({ image_url: artistImage ?? fallbackEventImage(category, row.name) }).eq('id', event.id)
  await db.from('gigsberg_catalogue_events').update({ matched_event_id: event.id, match_status: 'approved_new', match_reason: 'Imported automatically from the Gigsberg catalogue', match_checked_at: new Date().toISOString(), image_status: artistImage ? 'artist_image' : 'branded_fallback' }).eq('id', row.id)
  return event.id as string
}

async function createSeeTicketsEvent(db: Loose, row: SeeTicketsRow): Promise<string> {
  const venueId = await findOrCreateVenue(db, row.venue!, row.city!)
  const category = inferEventCategory(row.name)
  const slug = `${slugify(`${row.name}-${row.event_date}-${row.city}`)}-${slugify(row.id).slice(0, 24)}`
  const { data: event, error } = await db.from('events').insert({
    title: row.name, slug, description: `Live event in ${row.city}. Check See Tickets for current ticket availability.`, category, venue_id: venueId,
    start_date: londonToUtcIso(row.event_date!, null), currency: 'GBP', see_tickets_affiliate_url: row.url,
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
  const { data: state } = await db.from('feed_import_state').select('mode, max_per_run').eq('id', 1).maybeSingle() as { data: { mode: Mode; max_per_run: number } | null }
  const mode: Mode = state?.mode ?? 'dry'
  const maxPerRun = state?.max_per_run ?? 150
  const result: FeedImportResult = { mode, status: 'complete', maxPerRun, gigsberg: emptyStats(), see_tickets: emptyStats(), durationMs: 0 }
  if (mode === 'off') { result.status = 'disabled'; return result }

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
  const gRows = await fetchCandidates<GigsbergRow>(db, 'gigsberg_catalogue_events', 'id, name, event_date, event_time, venue, city, performer1, url', today, horizon)
  g.candidates = gRows.length
  for (const row of gRows) {
    if (outOfTime()) { result.status = 'partial'; break }
    const why = skipReason(row, sameDay(row.event_date!), today)
    if (why) { bump(g, why); continue }
    g.eligible++
    if (mode === 'dry') { g.wouldImport++; if (g.sample.length < 12) g.sample.push(`${row.name} | ${row.venue}, ${row.city} | ${row.event_date}`); remember(row); continue }
    if (g.imported >= maxPerRun) { result.status = 'partial'; continue }
    try {
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
  const sRows = await fetchCandidates<SeeTicketsRow>(db, 'see_tickets_catalogue_events', 'id, name, event_date, venue, city, primary_artist, second_artist, url', today, horizon)
  s.candidates = sRows.length
  for (const row of sRows) {
    if (outOfTime()) { result.status = 'partial'; break }
    const why = skipReason(row, sameDay(row.event_date!), today)
    if (why) { bump(s, why); continue }
    s.eligible++
    if (mode === 'dry') { s.wouldImport++; if (s.sample.length < 12) s.sample.push(`${row.name} | ${row.venue}, ${row.city} | ${row.event_date}`); remember(row); continue }
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
