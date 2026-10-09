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
  artists: { artist: { name: string } | null }[]
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
  const sameVenue = Boolean(normalize(catalogue.venue) && normalize(catalogue.venue) === normalize(event.venue?.name))
  // Some catalogue records have the artist only in the event name and leave
  // performer1/performer2 empty. Keep the structured performer fields first,
  // but use the event name as a fallback so obvious artist/date/city matches
  // are not sent through manual review.
  const cataloguePerformers = [...new Set(
    [catalogue.performer1, catalogue.performer2, catalogue.name]
      .filter((name): name is string => Boolean(name?.trim()))
      .map(name => name.trim()),
  )]
  const titlePerformerExact = cataloguePerformers.some(catalogueName => {
    const performerName = normalize(catalogueName)
    const candidate = normalize(event.title)
    return Boolean(performerName && candidate && (candidate === performerName || candidate.includes(performerName) || performerName.includes(candidate)))
  })
  const linkedArtistExact = cataloguePerformers.some(catalogueName => {
    const performerName = normalize(catalogueName)
    return (event.artists ?? []).some(row => {
      const candidate = normalize(row.artist?.name)
      return Boolean(performerName && candidate && (candidate === performerName || candidate.includes(performerName) || performerName.includes(candidate)))
    })
  })
  const performerExact = titlePerformerExact || linkedArtistExact
  // Deliberately compare against the event title only. Linked artist rows are
  // useful evidence, but they must not manufacture a match when the title is
  // a different headliner or stale relation.
  const performerOverlap = Math.max(
    ...cataloguePerformers.map(catalogueName => tokenOverlap(catalogueName, event.title)),
    0,
  )

  // Artist evidence is mandatory. Date, city and venue refine a match but
  // must never make two unrelated events match merely because they happen in
  // the same city on the same day.
  let value = 0
  value += titlePerformerExact ? 0.55 : linkedArtistExact ? 0.35 : performerOverlap * 0.55
  if (sameDate) value += 0.25
  if (sameCity) value += 0.1
  value += sameVenue ? 0.1 : venueOverlap * 0.1
  return { value, sameDate, sameCity, sameVenue, venueOverlap, performerOverlap, performerExact, titlePerformerExact, linkedArtistExact }
}

export async function matchGigsbergCatalogue(): Promise<GigsbergMatchResult> {
  const db = createAdminClient()
  const [{ data: catalogue, error: catalogueError }, { data: events, error: eventsError }] = await Promise.all([
    db.from('gigsberg_catalogue_events').select('id, name, event_date, venue, city, performer1, performer2, url, matched_event_id').in('match_status', ['pending', 'review', 'no_match', 'auto_matched']).limit(50000),
    db.from('events').select('id, title, start_date, gigsberg_affiliate_url, venue:venues(name, city), artists:event_artists(artist:artists(name))').gte('start_date', new Date().toISOString()).limit(50000),
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
      // A linked artist row alone is not enough to identify the event. It can
      // be stale or incorrectly attached to a different headliner (for
      // example, Amon Amarth was being suggested as The Darkness). Require
      // the performer to appear in the event title, or use token overlap for
      // a genuinely similar title. This keeps unrelated same-day London
      // events out of the review queue.
      .filter(candidate => candidate.detail.titlePerformerExact || candidate.detail.performerOverlap >= 0.6)
      .sort((a, b) => b.detail.value - a.detail.value)
    const best = ranked[0]
    const second = ranked[1]
    const directIdentityMatch = Boolean(best && best.detail.titlePerformerExact && best.detail.sameDate && best.detail.sameCity && (best.detail.sameVenue || best.detail.venueOverlap >= 0.5))
    const confident = Boolean(best && (
      directIdentityMatch
      || (best.detail.titlePerformerExact && best.detail.sameDate && best.detail.sameCity && best.detail.value >= 0.78 && (!second || best.detail.value - second.detail.value >= 0.08))
      || (best.detail.performerOverlap >= 0.6 && best.detail.sameDate && best.detail.value >= 0.78 && (!second || best.detail.value - second.detail.value >= 0.12))
    ))
    const review = Boolean(best && !confident && best.detail.value >= 0.45)
    const status = confident ? 'auto_matched' : review ? 'review' : 'no_match'

    const { error } = await db.from('gigsberg_catalogue_events').update({
      matched_event_id: confident ? best.event.id : null,
      match_status: status,
      match_confidence: best ? Number(best.detail.value.toFixed(3)) : null,
      match_reason: best ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match${best.detail.titlePerformerExact ? ', title confirmed' : best.detail.linkedArtistExact ? ', linked artist only' : ''})` : 'No close Showfinder event found',
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
    } else {
      // If a previous automatic match is now rejected by the stricter
      // artist-first check, remove only the link created from this catalogue
      // record. Manually curated or differently sourced links are untouched.
      if (item.matched_event_id) {
        await db.from('events').update({ gigsberg_affiliate_url: null }).eq('id', item.matched_event_id).eq('gigsberg_affiliate_url', item.url)
      }
      if (review) result.review++
      else result.noMatch++
    }
  }

  return result
}
