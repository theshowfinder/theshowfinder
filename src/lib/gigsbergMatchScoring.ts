// Pure scoring and decision rules for matching a Gigsberg catalogue row to a
// Showfinder event. Split out of gigsbergMatching.ts (which talks to
// Supabase through the '@/' alias) so the rules that decide which affiliate
// links go live can be unit tested. The rules themselves are unchanged from
// the original matcher; only where candidates come from changed (see
// bucketEventsByDate).

import { resolveFeedCity } from './feedImportRules.ts'
import { SAME_SHOW_MINUTES } from './venueFamily.ts'

// "Newcastle upon Tyne" (Gigsberg) and "Newcastle" (Ticketmaster) are the same city.
const cityCache = new Map<string, string>()
function sameCityName(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (v: string | null | undefined) => {
    const raw = v ?? ''
    let hit = cityCache.get(raw)
    if (hit === undefined) { hit = normalize(resolveFeedCity(raw, null) ?? raw); cityCache.set(raw, hit) }
    return hit
  }
  const x = key(a)
  return Boolean(x) && x === key(b)
}

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

const normalizeCache = new Map<string, string>()
export function normalize(value: string | null | undefined) {
  const key = value ?? ''
  const hit = normalizeCache.get(key)
  if (hit !== undefined) return hit
  if (normalizeCache.size > 200_000) normalizeCache.clear()
  const out = normalizeUncached(key)
  normalizeCache.set(key, out)
  return out
}
function normalizeUncached(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const UK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
const dateOnlyCache = new Map<string, string>()
export function dateOnly(value: string) {
  const hit = dateOnlyCache.get(value)
  if (hit !== undefined) return hit
  const out = dateOnlyUncached(value)
  dateOnlyCache.set(value, out)
  return out
}
function dateOnlyUncached(value: string) {
  // Gigsberg supplies a local calendar date, while Showfinder stores event
  // timestamps in UTC. Convert timestamps to the UK calendar date before
  // comparing so late-night UTC values do not appear one day early.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return UK_DATE.format(date)
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
// The site's one definition of "same performance": src/lib/venueFamily.ts.
export const SAME_SHOW_TIME_MINUTES = SAME_SHOW_MINUTES

export function tokenOverlap(left: string, right: string) {
  const a = new Set(normalize(left).split(' ').filter(token => token.length > 2))
  const b = new Set(normalize(right).split(' ').filter(token => token.length > 2))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / Math.max(a.size, b.size)
}

// ---- Venues -----------------------------------------------------------------
function cityTokens(...cities: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>()
  for (const city of cities) for (const token of normalize(city ?? '').split(' ')) if (token) out.add(token)
  return out
}
function withoutWords(value: string, words: Set<string>): string {
  if (!words.size) return value
  return normalize(value).split(' ').filter(token => token && !words.has(token)).join(' ')
}
// Gigsberg adds old names in brackets ("OVO Hydro (formerly The SSE Hydro)") and
// words like "Stadium" that Ticketmaster may leave out ("Loftus Road" vs
// "Loftus Road Stadium"). Compare the venue's own name only.
const VENUE_FILLER = /\b(the|stadium|arena|theatre|theater|hall|centre|center|venue|live|ltd)\b/g
const cleanVenueCache = new Map<string, string>()
export function cleanVenue(value: string | null | undefined): string {
  const key = value ?? ''
  const hit = cleanVenueCache.get(key)
  if (hit !== undefined) return hit
  const out = cleanVenueUncached(key)
  cleanVenueCache.set(key, out)
  return out
}
function cleanVenueUncached(value: string): string {
  // "P&J Live, Aberdeen" -> "P&J Live": the town after a comma is not part of the venue's name.
  return normalize((value.split(',')[0] ?? '').replace(/\([^)]*\)/g, ' ').replace(/\bformerly\b.*$/i, ' ')).replace(VENUE_FILLER, ' ').replace(/\s+/g, ' ').trim()
}

// ---- Football (and other "A vs B") fixtures ------------------------------------
// Ticketmaster writes "QPR v Swansea City", Gigsberg "Queens Park Rangers vs
// Swansea City". A fixture only matches a fixture between the same two teams;
// anything else on the day (a screening of the match, a women's or U21 game,
// a gig at the stadium) is never a candidate.
const TEAM_ALIASES: Record<string, string> = {
  'qpr': 'queens park rangers', 'spurs': 'tottenham hotspur', 'tottenham': 'tottenham hotspur',
  'wolves': 'wolverhampton wanderers', 'wolverhampton': 'wolverhampton wanderers',
  'man utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city',
  'west brom': 'west bromwich albion', 'west bromwich': 'west bromwich albion',
  'brighton': 'brighton hove albion', 'brighton and hove albion': 'brighton hove albion',
  'nottm forest': 'nottingham forest', 'forest': 'nottingham forest',
  'sheff utd': 'sheffield united', 'sheff united': 'sheffield united', 'sheff wed': 'sheffield wednesday',
  'mk dons': 'milton keynes dons', 'psg': 'paris saint germain', 'boro': 'middlesbrough',
  'inter': 'inter milan', 'newcastle': 'newcastle united', 'leeds': 'leeds united', 'west ham': 'west ham united',
}
const TEAM_SUFFIX = new Set(['city', 'united', 'town', 'rovers', 'county', 'athletic', 'albion', 'wanderers', 'hotspur', 'argyle', 'orient', 'rangers', 'alexandra', 'villa'])
// City names with two big clubs: "Manchester" alone could be either.
const AMBIGUOUS_BASE = new Set(['manchester', 'sheffield', 'bristol', 'nottingham', 'birmingham'])
const SQUAD = /\b(women|womens|ladies|u\d{2}s?|under \d{2}s?|youth|academy|reserves|legends)\b/
const FIXTURE_SPLIT = /\s+(?:vs?\.?|versus|-v-)\s+/i

function team(raw: string): string {
  let t = normalize(raw.replace(/\(.*?\)/g, ' ')).replace(/\b(a?fc|football club|cf|sc)\b/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim()
  return TEAM_ALIASES[t] ?? t
}

// Scoring runs millions of times per matching run (every listing x every event that day): cache per title.
const fixtureCache = new Map<string, [string, string] | null>()
/** The two teams of an "A vs B" title (squad marker kept so women's / U21 games stay separate), or null. */
export function fixtureTeams(title: string): [string, string] | null {
  const hit = fixtureCache.get(title)
  if (hit !== undefined) return hit
  const out = fixtureTeamsUncached(title)
  fixtureCache.set(title, out)
  return out
}
function fixtureTeamsUncached(title: string): [string, string] | null {
  const cleaned = title.replace(/^[^:]*:\s*(?=.*\sv)/, (m) => /\bvs?\b/i.test(m) ? m : '')
  const parts = cleaned.split(FIXTURE_SPLIT)
  if (parts.length !== 2) return null
  // The competition is not a team: "Nations Championship 2026: Wales V Australia",
  // "UEFA Nations League - Northern Ireland V Ukraine", "Wales v Portugal - Six Nations".
  const home = parts[0].split(/:|\s[-–|]\s/).pop() ?? parts[0]
  const away = parts[1].split(/:|\s[-–|]\s/)[0] ?? parts[1]
  const [a, b] = [home, away].map(team)
  if (!a || !b || a.split(' ').length > 5 || b.split(' ').length > 5) return null
  return [a, b]
}

export function sameTeam(a: string, b: string): boolean {
  if (a === b) return true
  if (SQUAD.test(a) !== SQUAD.test(b)) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (!long.startsWith(`${short} `)) return false
  if (AMBIGUOUS_BASE.has(short)) return false
  const rest = long.slice(short.length + 1).split(' ')
  return rest.every(word => TEAM_SUFFIX.has(word))
}

/** null when the listing is not a fixture; else whether the event is the same fixture. */
export function fixtureMatch(listingName: string, eventTitle: string): boolean | null {
  if (!/\sv/i.test(listingName)) return null
  const listing = fixtureTeams(listingName)
  if (!listing) return null
  if (/\bscreening\b/i.test(eventTitle) && !/\bscreening\b/i.test(listingName)) return false
  const ev = fixtureTeams(eventTitle)
  if (!ev) return false
  return sameTeam(listing[0], ev[0]) && sameTeam(listing[1], ev[1])
}

export function score(catalogue: CatalogueRow, event: ShowfinderEvent) {
  const sameDate = dateOnly(catalogue.event_date) === dateOnly(event.start_date)
  const sameCity = sameCityName(catalogue.city, event.venue?.city)
  // The town is not evidence of the same venue: "Olympia London" and "The London Dungeon" share only
  // "London", "Plymouth Pavilions" and "Plymouth University" only "Plymouth". Strip both cities first.
  const cityWords = cityTokens(catalogue.city, event.venue?.city)
  const venueOverlap = Math.max(
    tokenOverlap(withoutWords(catalogue.venue ?? '', cityWords), withoutWords(event.venue?.name ?? '', cityWords)),
    tokenOverlap(withoutWords(cleanVenue(catalogue.venue), cityWords), withoutWords(cleanVenue(event.venue?.name), cityWords)),
  )
  const sameVenue = Boolean(cleanVenue(catalogue.venue) && cleanVenue(catalogue.venue) === cleanVenue(event.venue?.name))
  // Some catalogue records have the artist only in the event name and leave
  // performer1/performer2 empty. Keep the structured performer fields first,
  // but use the event name as a fallback so obvious artist/date/city matches
  // are not sent through manual review.
  const cataloguePerformers = [...new Set(
    [catalogue.performer1, catalogue.performer2, catalogue.name]
      .filter((name): name is string => Boolean(name?.trim()))
      .map(name => name.trim()),
  )]
  const fixture = fixtureMatch(catalogue.name, event.title)
  const titlePerformerExact = fixture !== null ? fixture : cataloguePerformers.some(catalogueName => {
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
  const performerExact = fixture === false ? false : titlePerformerExact || linkedArtistExact
  // Deliberately compare against the event title only. Linked artist rows are
  // useful evidence, but they must not manufacture a match when the title is
  // a different headliner or stale relation.
  const performerOverlap = fixture !== null ? (fixture ? 1 : 0) : Math.max(
    ...cataloguePerformers.map(catalogueName => tokenOverlap(catalogueName, event.title)),
    0,
  )

  // Artist evidence is mandatory. Date, city and venue refine a match but
  // must never make two unrelated events match merely because they happen in
  // the same city on the same day.
  let value = 0
  value += titlePerformerExact ? 0.55 : linkedArtistExact && fixture !== false ? 0.35 : performerOverlap * 0.55
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

// Listings that are products sold against a show (hospitality, suites, premium
// tickets) or a screening of it are never the show itself. Linking a Gigsberg
// listing to "Venue Premium - Kevin Bridges" instead of "Kevin Bridges" left
// both looking equally good, so obvious matches went to manual review.
const NOT_THE_SHOW = /\b(vip|premium|hospitality|lounge|packages?|upgrades?|share a suite|suites?|meet\s*(?:&|and)?\s*greets?|ticket\s+experiences?|fast[\s-]?track|parking|screening)\b/i
// "The Kilimanjaro Darkjazz Ensemble - Restaurant": a restaurant-table ticket for the show, not the show.
const RESTAURANT_COPY = /[-–—:|]\s*(restaurant|dining)(\s+(tickets?|tables?))?\s*$/i
export function isMatchableEvent(item: Pick<CatalogueRow, 'name'>, event: Pick<ShowfinderEvent, 'title'>): boolean {
  if (RESTAURANT_COPY.test(event.title) && !/\b(restaurant|dining)\b/i.test(item.name)) return false
  const m = NOT_THE_SHOW.exec(event.title)
  if (!m) return true
  // The listing itself is that product ("Paul Heaton - Hospitality"): same kind may match.
  return new RegExp(`\\b${m[1].replace(/\s+/g, '\\s+')}\\b`, 'i').test(item.name)
}

export type MatchStatus = 'auto_matched' | 'review' | 'no_match'

export interface MatchDecision {
  status: MatchStatus
  event: ShowfinderEvent | null
  confidence: number | null
  reason: string
  // Minutes between the listing's showtime and the chosen (or best) event, when both are known.
  timeGap: number | null
  // For 'review': the event the matcher thinks it most likely is, so a person can confirm it in one click.
  suggestion?: ShowfinderEvent | null
}

// Showtime only ever breaks ties between otherwise equal events: Gigsberg times
// are sometimes placeholders (sports, festivals), so it is never a hard filter.
function timeBonus(gap: number | null) {
  if (gap === null) return 0
  if (gap <= 25) return 0.1
  if (gap <= 75) return 0.04
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
  // Score plus the showtime bonus: lets "3:30pm" beat "7:30pm" for a 3:30pm listing.
  const adjusted = (candidate: { detail: ReturnType<typeof score> }) => candidate.detail.value + timeBonus(candidate.detail.timeGap)
  const gapOf = (c: { detail: ReturnType<typeof score> }) => c.detail.timeGap ?? 9999
  const ranked = candidates
    .filter(event => isMatchableEvent(item, event))
    .map(event => ({ event, detail: score(item, event) }))
    // A linked artist row alone is not enough to identify the event. It can
    // be stale or incorrectly attached to a different headliner (for
    // example, Amon Amarth was being suggested as The Darkness). Require
    // the performer to appear in the event title, or use token overlap for
    // a genuinely similar title. This keeps unrelated same-day London
    // events out of the review queue.
    .filter(candidate => candidate.detail.titlePerformerExact || candidate.detail.performerOverlap >= 0.6)
    // Equal scores: the closest showtime first (two performances a day); then, for the same show listed twice
    // by Ticketmaster (identical title, venue and time), the copy that already carries this Gigsberg link,
    // so a re-run never moves the button between duplicates.
    .sort((a, b) => (adjusted(b) - adjusted(a)) || (gapOf(a) - gapOf(b))
      || (Number(b.event.gigsberg_affiliate_url === item.url) - Number(a.event.gigsberg_affiliate_url === item.url))
      || a.event.id.localeCompare(b.event.id))
  // The same show listed twice by Ticketmaster: identical title, venue, day and time. Either copy is right.
  const sameShowTwice = (x?: { event: ShowfinderEvent; detail: ReturnType<typeof score> }, y?: { event: ShowfinderEvent; detail: ReturnType<typeof score> }) =>
    Boolean(x && y && normalize(x.event.title) === normalize(y.event.title) && cleanVenue(x.event.venue?.name) === cleanVenue(y.event.venue?.name) && x.event.start_date === y.event.start_date)
  const best = ranked[0]
  const second = ranked[1]
  // The same show listed twice in a day (11:30 and 17:30): a clearly closer
  // showtime separates the two even when the titles score the same.
  const clearlyCloserTime = Boolean(best && second && best.detail.timeGap !== null && second.detail.timeGap !== null
    && best.detail.timeGap <= 120 && second.detail.timeGap - best.detail.timeGap >= 120)
  const directIdentityMatch = Boolean(best && best.detail.titlePerformerExact && best.detail.sameDate && best.detail.sameCity && (best.detail.sameVenue || best.detail.venueOverlap >= 0.5)
    )
  const confident = Boolean(best && (
    directIdentityMatch
    || (best.detail.titlePerformerExact && best.detail.sameDate && best.detail.sameCity && best.detail.value >= 0.78 && (!second || adjusted(best) - adjusted(second) >= 0.08 || clearlyCloserTime || sameShowTwice(best, second)))
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
        suggestion: null,
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
    suggestion: status === 'review' && best ? best.event : null,
  }
}
