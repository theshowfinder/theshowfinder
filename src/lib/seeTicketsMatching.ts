import { createAdminClient } from '@/lib/supabase/admin'

type CatalogueRow = {
  id: string
  name: string
  event_date: string | null
  venue: string | null
  city: string | null
  primary_artist: string | null
  second_artist: string | null
  url: string
  matched_event_id: string | null
  match_checked_at: string | null
}

type ShowfinderEvent = {
  id: string
  title: string
  start_date: string
  see_tickets_affiliate_url: string | null
  venue: { name: string; city: string } | null
}

export type SeeTicketsMatchResult = {
  checked: number
  autoMatched: number
  review: number
  noMatch: number
  errors: number
  nextCursor?: string | null
  hasMore?: boolean
}

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function comparableVenue(value: string | null | undefined) {
  return normalize(value)
    .replace(/\b(the|o2|ao|live|venue|music|entertainment|centre|center|arena|hall|theatre|theater)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dateOnly(value: string | null) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function overlap(left: string | null, right: string | null) {
  const a = new Set(normalize(left).split(' ').filter(token => token.length > 2))
  const b = new Set(normalize(right).split(' ').filter(token => token.length > 2))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / Math.max(a.size, b.size)
}

function score(item: CatalogueRow, event: ShowfinderEvent) {
  const names = [item.primary_artist, item.second_artist, item.name].filter(Boolean) as string[]
  const title = normalize(event.title)
  const titleMatch = names.some(name => {
    const candidate = normalize(name)
    return Boolean(candidate && title && (title === candidate || title.includes(candidate) || candidate.includes(title)))
  })
  const titleOverlap = Math.max(...names.map(name => overlap(name, event.title)), 0)
  const sameDate = dateOnly(item.event_date) === dateOnly(event.start_date)
  const sameCity = normalize(item.city) === normalize(event.venue?.city)
  const venueExact = Boolean(comparableVenue(item.venue) && comparableVenue(item.venue) === comparableVenue(event.venue?.name))
  const venueOverlap = Math.max(overlap(item.venue, event.venue?.name ?? null), overlap(comparableVenue(item.venue), comparableVenue(event.venue?.name)))
  let value = titleMatch ? 0.55 : titleOverlap * 0.55
  if (sameDate) value += 0.25
  if (sameCity) value += 0.1
  value += venueExact ? 0.1 : venueOverlap * 0.1
  return { value, titleMatch, titleOverlap, sameDate, sameCity, venueExact, venueOverlap }
}

export async function matchSeeTicketsCatalogue(fullRescan = false, options: { limit?: number; afterId?: string } = {}): Promise<SeeTicketsMatchResult> {
  const db = createAdminClient()
  const catalogue: CatalogueRow[] = []
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 500) : null
  for (let offset = 0; ; offset += 1000) {
    let query = db.from('see_tickets_catalogue_events').select('id, name, event_date, venue, city, primary_artist, second_artist, url, matched_event_id, match_checked_at').order('id', { ascending: true })
    if (!fullRescan) query = query.in('match_status', ['pending', 'review', 'no_match'])
    if (options.afterId) query = query.gt('id', options.afterId)
    query = query.range(offset, offset + (limit ? limit : 999))
    const { data, error } = await query as unknown as { data: CatalogueRow[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    const rows = data ?? []
    catalogue.push(...rows)
    if (rows.length < (limit ? limit + 1 : 1000)) break
    if (limit) break
  }
  const events: ShowfinderEvent[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('events').select('id, title, start_date, see_tickets_affiliate_url, venue:venues(name, city)').gte('start_date', new Date().toISOString()).range(offset, offset + 999) as unknown as { data: ShowfinderEvent[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    const rows = data ?? []
    events.push(...rows)
    if (rows.length < 1000) break
  }
  const eventsByDate = new Map<string, ShowfinderEvent[]>()
  for (const event of events ?? []) {
    const key = dateOnly(event.start_date)
    const bucket = eventsByDate.get(key) ?? []
    bucket.push(event)
    eventsByDate.set(key, bucket)
  }
  const hasMore = Boolean(limit && catalogue.length > limit)
  const rowsToProcess = limit ? catalogue.slice(0, limit) : catalogue
  const result: SeeTicketsMatchResult = {
    checked: 0, autoMatched: 0, review: 0, noMatch: 0, errors: 0,
    hasMore,
    nextCursor: rowsToProcess.length ? rowsToProcess[rowsToProcess.length - 1].id : null,
  }
  async function processItem(item: CatalogueRow) {
    // Do not discard a candidate merely because the feed's city or venue
    // label differs. Ticket feeds commonly use abbreviations, local venue
    // brands, or a nearby city. Score every event on the same date first;
    // city and venue still remain confidence checks before auto-linking.
    const candidates = eventsByDate.get(dateOnly(item.event_date)) ?? []
    const ranked = candidates.map(event => ({ event, detail: score(item, event) })).filter(candidate => candidate.detail.titleMatch || candidate.detail.titleOverlap >= 0.6).sort((a, b) => b.detail.value - a.detail.value)
    const best = ranked[0]
    const second = ranked[1]
    const confident = Boolean(best && best.detail.titleMatch && best.detail.sameDate && (best.detail.sameCity || best.detail.venueExact || best.detail.venueOverlap >= 0.5) && (!second || best.detail.value - second.detail.value >= 0.05))
    const review = Boolean(best && !confident && best.detail.value >= 0.4)
    const status = confident ? 'auto_matched' : review ? 'review' : 'no_match'
    const { error } = await db.from('see_tickets_catalogue_events').update({ matched_event_id: confident ? best.event.id : null, match_status: status, match_confidence: best ? Number(best.detail.value.toFixed(3)) : null, match_reason: best ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match)` : 'No close Showfinder event found', match_checked_at: new Date().toISOString() }).eq('id', item.id)
    if (error) return { errors: 1, autoMatched: 0, review: 0, noMatch: 0 }
    if (confident) {
      const { error: linkError } = await db.from('events').update({ see_tickets_affiliate_url: item.url }).eq('id', best.event.id).is('see_tickets_affiliate_url', null)
      if (linkError) return { errors: 1, autoMatched: 0, review: 0, noMatch: 0 }
      return { errors: 0, autoMatched: 1, review: 0, noMatch: 0 }
    } else {
      if (item.matched_event_id) await db.from('events').update({ see_tickets_affiliate_url: null }).eq('id', item.matched_event_id).eq('see_tickets_affiliate_url', item.url)
      return { errors: 0, autoMatched: 0, review: review ? 1 : 0, noMatch: review ? 0 : 1 }
    }
  }

  // Supabase writes are network-bound. Running them one-by-one makes a full
  // feed take several minutes and can exceed the Vercel function limit. Keep
  // the batch deliberately small so the database is not overwhelmed while
  // still completing a full catalogue in one request.
  const batchSize = 50
  for (let offset = 0; offset < rowsToProcess.length; offset += batchSize) {
    const batch = await Promise.all(rowsToProcess.slice(offset, offset + batchSize).map(processItem))
    result.checked += batch.length
    for (const outcome of batch) {
      result.errors += outcome.errors
      result.autoMatched += outcome.autoMatched
      result.review += outcome.review
      result.noMatch += outcome.noMatch
    }
  }
  return result
}
