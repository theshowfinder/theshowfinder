import { createAdminClient } from '@/lib/supabase/admin'

type CatalogueRow = {
  id: number
  name: string
  event_date: string
  venue: string | null
  city: string | null
  performer1: string | null
  performer2: string | null
  url: string
  matched_event_id: string | null
}

type ShowfinderEvent = {
  id: string
  title: string
  start_date: string
  gigsberg_affiliate_url: string | null
  venue: { name: string; city: string } | null
}

export interface GigsbergMatchResult {
  checked: number
  autoMatched: number
  review: number
  noMatch: number
  errors: number
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dateOnly(value: string) {
  return value.slice(0, 10)
}

function tokenOverlap(left: string, right: string) {
  const a = new Set(normalize(left).split(' ').filter(token => token.length > 2))
  const b = new Set(normalize(right).split(' ').filter(token => token.length > 2))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / Math.max(a.size, b.size)
}

function score(catalogue: CatalogueRow, event: ShowfinderEvent) {
  const sameDate = dateOnly(catalogue.event_date) === dateOnly(event.start_date)
  const sameCity = normalize(catalogue.city) === normalize(event.venue?.city)
  const venueOverlap = tokenOverlap(catalogue.venue ?? '', event.venue?.name ?? '')
  const performerOverlap = Math.max(
    tokenOverlap(catalogue.performer1 ?? '', event.title),
    tokenOverlap(catalogue.performer2 ?? '', event.title),
  )

  let value = 0
  if (sameDate) value += 0.35
  if (sameCity) value += 0.2
  value += venueOverlap * 0.2
  value += performerOverlap * 0.25
  return { value, sameDate, sameCity, venueOverlap, performerOverlap }
}

export async function matchGigsbergCatalogue(): Promise<GigsbergMatchResult> {
  const db = createAdminClient()
  const [{ data: catalogue, error: catalogueError }, { data: events, error: eventsError }] = await Promise.all([
    db.from('gigsberg_catalogue_events').select('id, name, event_date, venue, city, performer1, performer2, url, matched_event_id').in('match_status', ['pending', 'review']).limit(50000),
    db.from('events').select('id, title, start_date, gigsberg_affiliate_url, venue:venues(name, city)').gte('start_date', new Date().toISOString()).limit(50000),
  ]) as unknown as [
    { data: CatalogueRow[] | null; error: { message: string } | null },
    { data: ShowfinderEvent[] | null; error: { message: string } | null },
  ]

  if (catalogueError) throw new Error(catalogueError.message)
  if (eventsError) throw new Error(eventsError.message)

  const result: GigsbergMatchResult = { checked: 0, autoMatched: 0, review: 0, noMatch: 0, errors: 0 }
  for (const item of catalogue ?? []) {
    result.checked++
    const ranked = (events ?? [])
      .map(event => ({ event, detail: score(item, event) }))
      .filter(candidate => candidate.detail.sameDate || candidate.detail.performerOverlap >= 0.6)
      .sort((a, b) => b.detail.value - a.detail.value)
    const best = ranked[0]
    const second = ranked[1]
    const confident = Boolean(best && best.detail.value >= 0.82 && (!second || best.detail.value - second.detail.value >= 0.12))
    const review = Boolean(best && !confident && best.detail.value >= 0.45)
    const status = confident ? 'auto_matched' : review ? 'review' : 'no_match'

    const { error } = await db.from('gigsberg_catalogue_events').update({
      matched_event_id: confident ? best.event.id : null,
      match_status: status,
      match_confidence: best ? Number(best.detail.value.toFixed(3)) : null,
      match_reason: best ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match)` : 'No close Showfinder event found',
      match_checked_at: new Date().toISOString(),
    }).eq('id', item.id)

    if (error) {
      result.errors++
      continue
    }

    if (confident) {
      const { error: linkError } = await db.from('events').update({ gigsberg_affiliate_url: item.url }).eq('id', best.event.id)
      if (linkError) result.errors++
      else result.autoMatched++
    } else if (review) result.review++
    else result.noMatch++
  }

  return result
}
