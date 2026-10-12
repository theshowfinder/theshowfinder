// Pure scoring and decision rules for matching a Gigsberg catalogue row to a
// Showfinder event. Split out of gigsbergMatching.ts (which talks to
// Supabase through the '@/' alias) so the rules that decide which affiliate
// links go live can be unit tested. The rules themselves are unchanged from
// the original matcher; only where candidates come from changed (see
// bucketEventsByDate).

export type CatalogueRow = {
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

export type ShowfinderEvent = {
  id: string
  title: string
  start_date: string
  gigsberg_affiliate_url: string | null
  venue: { name: string; city: string } | null
  artists: { artist: { name: string } | null }[]
}

export function normalize(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function dateOnly(value: string) {
  // Gigsberg supplies a local calendar date, while Showfinder stores event
  // timestamps in UTC. Convert timestamps to the UK calendar date before
  // comparing so late-night UTC values do not appear one day early.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function tokenOverlap(left: string, right: string) {
  const a = new Set(normalize(left).split(' ').filter(token => token.length > 2))
  const b = new Set(normalize(right).split(' ').filter(token => token.length > 2))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / Math.max(a.size, b.size)
}

export function score(catalogue: CatalogueRow, event: ShowfinderEvent) {
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

// Group events by UK calendar date so each catalogue row is only scored
// against events on its own date. Scoring every row against every upcoming
// event (3,500 x 28,000) is far too slow, and an event on a different date is
// a different show — the same artist's other tour dates must not show up as
// review candidates for this one.
export function bucketEventsByDate(events: ShowfinderEvent[]): Map<string, ShowfinderEvent[]> {
  const buckets = new Map<string, ShowfinderEvent[]>()
  for (const event of events) {
    const key = dateOnly(event.start_date)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(event)
    else buckets.set(key, [event])
  }
  return buckets
}

export type MatchStatus = 'auto_matched' | 'review' | 'no_match'

export interface MatchDecision {
  status: MatchStatus
  event: ShowfinderEvent | null
  confidence: number | null
  reason: string
}

export function decideMatch(item: CatalogueRow, candidates: ShowfinderEvent[]): MatchDecision {
  const ranked = candidates
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
  const status: MatchStatus = confident ? 'auto_matched' : review ? 'review' : 'no_match'
  return {
    status,
    event: confident && best ? best.event : null,
    confidence: best ? Number(best.detail.value.toFixed(3)) : null,
    reason: best
      ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match${best.detail.titlePerformerExact ? ', title confirmed' : best.detail.linkedArtistExact ? ', linked artist only' : ''})`
      : 'No close Showfinder event found',
  }
}
