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

export type SeeTicketsMatchResult = { checked: number; autoMatched: number; review: number; noMatch: number; errors: number }

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
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
  const venueExact = Boolean(normalize(item.venue) && normalize(item.venue) === normalize(event.venue?.name))
  const venueOverlap = overlap(item.venue, event.venue?.name ?? null)
  let value = titleMatch ? 0.55 : titleOverlap * 0.55
  if (sameDate) value += 0.25
  if (sameCity) value += 0.1
  value += venueExact ? 0.1 : venueOverlap * 0.1
  return { value, titleMatch, titleOverlap, sameDate, sameCity, venueExact, venueOverlap }
}

export async function matchSeeTicketsCatalogue(fullRescan = false): Promise<SeeTicketsMatchResult> {
  const db = createAdminClient()
  let query = db.from('see_tickets_catalogue_events').select('id, name, event_date, venue, city, primary_artist, second_artist, url, matched_event_id, match_checked_at').limit(50000)
  if (!fullRescan) query = query.in('match_status', ['pending', 'review', 'no_match'])
  const [{ data: catalogue, error: catalogueError }, { data: events, error: eventsError }] = await Promise.all([
    query,
    db.from('events').select('id, title, start_date, see_tickets_affiliate_url, venue:venues(name, city)').gte('start_date', new Date().toISOString()).limit(50000),
  ]) as unknown as [{ data: CatalogueRow[] | null; error: { message: string } | null }, { data: ShowfinderEvent[] | null; error: { message: string } | null }]
  if (catalogueError) throw new Error(catalogueError.message)
  if (eventsError) throw new Error(eventsError.message)
  const eventsByDateCity = new Map<string, ShowfinderEvent[]>()
  for (const event of events ?? []) {
    const key = `${dateOnly(event.start_date)}|${normalize(event.venue?.city)}`
    const bucket = eventsByDateCity.get(key) ?? []
    bucket.push(event)
    eventsByDateCity.set(key, bucket)
  }
  const result: SeeTicketsMatchResult = { checked: 0, autoMatched: 0, review: 0, noMatch: 0, errors: 0 }
  for (const item of catalogue ?? []) {
    result.checked++
    const candidates = eventsByDateCity.get(`${dateOnly(item.event_date)}|${normalize(item.city)}`) ?? []
    const ranked = candidates.map(event => ({ event, detail: score(item, event) })).filter(candidate => candidate.detail.titleMatch || candidate.detail.titleOverlap >= 0.6).sort((a, b) => b.detail.value - a.detail.value)
    const best = ranked[0]
    const second = ranked[1]
    const confident = Boolean(best && best.detail.titleMatch && best.detail.sameDate && best.detail.sameCity && (best.detail.venueExact || best.detail.venueOverlap >= 0.5) && (!second || best.detail.value - second.detail.value >= 0.05))
    const review = Boolean(best && !confident && best.detail.value >= 0.45)
    const status = confident ? 'auto_matched' : review ? 'review' : 'no_match'
    const { error } = await db.from('see_tickets_catalogue_events').update({ matched_event_id: confident ? best.event.id : null, match_status: status, match_confidence: best ? Number(best.detail.value.toFixed(3)) : null, match_reason: best ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match)` : 'No close Showfinder event found', match_checked_at: new Date().toISOString() }).eq('id', item.id)
    if (error) { result.errors++; continue }
    if (confident) {
      const { error: linkError } = await db.from('events').update({ see_tickets_affiliate_url: item.url }).eq('id', best.event.id).is('see_tickets_affiliate_url', null)
      if (linkError) result.errors++
      else result.autoMatched++
    } else {
      if (item.matched_event_id) await db.from('events').update({ see_tickets_affiliate_url: null }).eq('id', item.matched_event_id).eq('see_tickets_affiliate_url', item.url)
      if (review) result.review++
      else result.noMatch++
    }
  }
  return result
}
