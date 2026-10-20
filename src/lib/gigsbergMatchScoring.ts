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
  // Gigsberg's London-local start time ("19:30:00"). Optional: other callers
  // (See Tickets, the manual link screens) have no showtime.
  event_time?: string | null
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

// ---- Show times -------------------------------------------------------------
// Comedians, pantomimes and tribute acts often play twice in a day (3:30pm and
// 7:30pm). Date, city and venue are identical for both, so the showtime is the
// only thing that says which Gigsberg listing belongs to which site event.
const LONDON_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const londonMinutesCache = new Map<string, number | null>()

/** Minutes after midnight, London time, for a UTC timestamp. Null when unknown (invalid, or exactly midnight = "time not announced"). */
export function londonMinutes(value: string): number | null {
  const cached = londonMinutesCache.get(value)
  if (cached !== undefined) return cached
  const date = new Date(value)
  let result: number | null = null
  if (!Number.isNaN(date.getTime())) {
    const parts = LONDON_TIME.formatToParts(date)
    const hour = Number(parts.find(part => part.type === 'hour')?.value)
    const minute = Number(parts.find(part => part.type === 'minute')?.value)
    const minutes = hour * 60 + minute
    result = Number.isFinite(minutes) && minutes !== 0 ? minutes : null
  }
  londonMinutesCache.set(value, result)
  return result
}

/** Minutes after midnight for a "HH:MM[:SS]" local time. Null when missing or 00:00. */
export function clockMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '')
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes === 0 ? null : minutes
}

export function formatClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** How many minutes apart the listing and the event start, or null when either has no usable time. */
export function showTimeGap(catalogue: Pick<CatalogueRow, 'event_time'>, event: Pick<ShowfinderEvent, 'start_date'>): number | null {
  const listed = clockMinutes(catalogue.event_time)
  const actual = londonMinutes(event.start_date)
  if (listed === null || actual === null) return null
  return Math.abs(listed - actual)
}

// Beyond this the listing and the event are probably different performances.
export const SAME_SHOW_TIME_MINUTES = 45

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
  const timeGap = showTimeGap(catalogue, event)
  return { value, sameDate, sameCity, sameVenue, venueOverlap, performerOverlap, performerExact, titlePerformerExact, linkedArtistExact, timeGap }
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

// The cheap first test every candidate must pass: the performer appears in
// the event title, or the titles genuinely overlap. It does not look at
// linked artists, so it can be run before those are loaded — which lets the
// matcher fetch linked artists only for events that could actually match.
export function hasTitleEvidence(item: CatalogueRow, event: ShowfinderEvent): boolean {
  const detail = score(item, { ...event, artists: [] })
  return detail.titlePerformerExact || detail.performerOverlap >= 0.6
}

export type MatchStatus = 'auto_matched' | 'review' | 'no_match'

export interface MatchDecision {
  status: MatchStatus
  event: ShowfinderEvent | null
  confidence: number | null
  reason: string
  // Minutes between the listing's showtime and the chosen (or best) event, when both are known.
  timeGap: number | null
}

// Showtime only ever breaks ties between otherwise equal events: Gigsberg times
// are sometimes placeholders (sports, festivals), so it is never a hard filter.
function timeBonus(gap: number | null) {
  if (gap === null) return 0
  if (gap <= 25) return 0.06
  if (gap <= 75) return 0.03
  return 0
}

/**
 * True when another listing for the same act, day and venue starts much closer
 * to this event than this listing does — i.e. this listing is the *other*
 * performance of the day and the event is already spoken for.
 */
export function siblingFitsBetter(item: CatalogueRow, event: ShowfinderEvent, siblings: CatalogueRow[]): CatalogueRow | null {
  const gap = showTimeGap(item, event)
  if (gap === null || gap <= SAME_SHOW_TIME_MINUTES) return null
  for (const sibling of siblings) {
    if (sibling.id === item.id) continue
    if (dateOnly(sibling.event_date) !== dateOnly(item.event_date)) continue
    const venueClose = normalize(sibling.venue) === normalize(item.venue) || tokenOverlap(sibling.venue ?? '', item.venue ?? '') >= 0.5
    if (!venueClose) continue
    if (tokenOverlap(sibling.name, item.name) < 0.5 && normalize(sibling.performer1) !== normalize(item.performer1)) continue
    const siblingGap = showTimeGap(sibling, event)
    if (siblingGap !== null && siblingGap + 30 < gap) return sibling
  }
  return null
}

export function decideMatch(item: CatalogueRow, candidates: ShowfinderEvent[], siblings: CatalogueRow[] = []): MatchDecision {
  const ranked = candidates
    .map(event => ({ event, detail: score(item, event) }))
    // A linked artist row alone is not enough to identify the event. It can
    // be stale or incorrectly attached to a different headliner (for
    // example, Amon Amarth was being suggested as The Darkness). Require
    // the performer to appear in the event title, or use token overlap for
    // a genuinely similar title. This keeps unrelated same-day London
    // events out of the review queue.
    .filter(candidate => candidate.detail.titlePerformerExact || candidate.detail.performerOverlap >= 0.6)
    .sort((a, b) => (b.detail.value + timeBonus(b.detail.timeGap)) - (a.detail.value + timeBonus(a.detail.timeGap)))
  const best = ranked[0]
  const second = ranked[1]
  const directIdentityMatch = Boolean(best && best.detail.titlePerformerExact && best.detail.sameDate && best.detail.sameCity && (best.detail.sameVenue || best.detail.venueOverlap >= 0.5))
  const confident = Boolean(best && (
    directIdentityMatch
    || (best.detail.titlePerformerExact && best.detail.sameDate && best.detail.sameCity && best.detail.value >= 0.78 && (!second || best.detail.value - second.detail.value >= 0.08))
    || (best.detail.performerOverlap >= 0.6 && best.detail.sameDate && best.detail.value >= 0.78 && (!second || best.detail.value - second.detail.value >= 0.12))
  ))
  const review = Boolean(best && !confident && best.detail.value >= 0.45)
  const base = best
    ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match${best.detail.titlePerformerExact ? ', title confirmed' : best.detail.linkedArtistExact ? ', linked artist only' : ''})`
    : 'No close Showfinder event found'
  const timeNote = !best ? '' : best.detail.timeGap !== null ? ` [time checked: ${best.detail.timeGap <= SAME_SHOW_TIME_MINUTES ? 'same showtime' : `${best.detail.timeGap} min apart`}]` : ' [time checked]'

  // A listing at a different time from the event, with a sibling listing that
  // fits that event better, is the other performance of the day: do not let it
  // take the event's link.
  if (confident && best) {
    const closer = siblingFitsBetter(item, best.event, siblings)
    if (closer) {
      return {
        status: 'review',
        event: null,
        confidence: Number(best.detail.value.toFixed(3)),
        reason: `${base} — but the ${formatClock(clockMinutes(closer.event_time) ?? 0)} listing fits this event's time better, so this ${formatClock(clockMinutes(item.event_time) ?? 0)} show needs its own event [time checked]`,
        timeGap: best.detail.timeGap,
      }
    }
  }
  const status: MatchStatus = confident ? 'auto_matched' : review ? 'review' : 'no_match'
  return {
    status,
    event: confident && best ? best.event : null,
    confidence: best ? Number(best.detail.value.toFixed(3)) : null,
    reason: base + timeNote,
    timeGap: best ? best.detail.timeGap : null,
  }
}
