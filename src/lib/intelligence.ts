// Pure logic for the admin Daily Intelligence Dashboard (Phase 6) —
// /admin/intelligence. No '@/' imports and no npm packages, so this is
// unit-testable with plain `node --test`, matching on-sale.ts /
// newsPublishing.ts / feedHealth.ts. The page itself
// (src/app/admin/intelligence/page.tsx) does all the Supabase querying
// and calls these functions to turn raw rows into the dashboard's
// sections — nothing in this file talks to a database, and nothing here
// writes anything: nothing in this file approves, publishes, deletes or
// sends anything. It only classifies and counts what's already there.

const DAY_MS = 24 * 60 * 60 * 1000

export interface DateWindow {
  startISO: string
  endISO:   string
}

// ── Europe/London date boundaries ────────────────────────────────────────
//
// DB timestamps are UTC. A naive "today" window built from UTC midnight
// drifts up to an hour from the real UK calendar day for roughly half the
// year (BST, UTC+1) — an event going on sale at 9am on a UK summer morning
// could get sorted into "yesterday" by a UTC-midnight boundary. These
// functions compute the real Europe/London wall-clock day via Intl (the
// IANA tz database), not a hardcoded +0/+1 rule, so they stay correct
// across the BST/GMT transition without needing updates if the UK's DST
// rules ever change. `now` is always a parameter, never read from the
// system clock internally, so every caller is deterministic and testable.

// Europe/London's UTC offset in minutes at `instant` (+60 during BST, 0
// during GMT).
function londonOffsetMinutes(instant: Date): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(instant)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  // Some ICU builds report hour=24 for midnight under hour12:false —
  // normalize before building a Date, or Date.UTC would roll into the
  // wrong day.
  const hour = get('hour') % 24
  const wallClockAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return Math.round((wallClockAsUTC - instant.getTime()) / 60_000)
}

function londonDateParts(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

// Adds `days` to a Y/M/D calendar date using pure Gregorian arithmetic
// (via Date.UTC, which correctly rolls a day value past the end of a
// month/year) — no timezone involved, this is calendar maths only.
function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

// The real UTC instant for Europe/London midnight on a given Y/M/D. Uses
// noon UTC on that same date as the reference instant for determining
// London's offset — stable for any date except within the DST transition
// itself (twice a year, a few-hour window), an acceptable edge case for a
// dashboard date filter rather than a billing system. Computing the
// offset per-date (rather than once from `now`) is what makes a multi-day
// window — see londonDaysAheadWindow below — land correctly even when
// the window spans a BST/GMT transition.
function londonMidnightUTCForDate(parts: { year: number; month: number; day: number }): Date {
  const referenceInstant = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0))
  const offsetMin = londonOffsetMinutes(referenceInstant)
  const wallClockAsUTC = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0)
  return new Date(wallClockAsUTC - offsetMin * 60_000)
}

// Midnight-to-midnight (UK calendar day) for the day `now` falls on, as
// UTC instants — e.g. for `.gte('start_date', startISO).lt('start_date',
// endISO)`, meaning "on this UK day" rather than "within the last/next 24
// UTC hours".
export function londonDayWindow(now: Date): DateWindow {
  const todayParts = londonDateParts(now)
  const start = londonMidnightUTCForDate(todayParts)
  const end = londonMidnightUTCForDate(addCalendarDays(todayParts, 1))
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

// Today's London midnight through `days` London calendar days ahead —
// anchored to the UK day boundary. Each end of the window has its offset
// computed independently for its own calendar date, so this stays exactly
// `days` real London days even when a BST/GMT transition falls inside
// the window (a naive `start + days * 24h` would be off by an hour in
// that case).
export function londonDaysAheadWindow(now: Date, days: number): DateWindow {
  const todayParts = londonDateParts(now)
  const start = londonMidnightUTCForDate(todayParts)
  const end = londonMidnightUTCForDate(addCalendarDays(todayParts, days))
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

// Monday 00:00 through the following Monday 00:00 (exclusive) — the
// literal Mon-Sun UK calendar week containing `now`, not a rolling
// N-day lookback. "On Sale This Week" (on-sale.ts's onSaleThisWeekWindow)
// needs this specific meaning of "this week" per the Manchester-pilot
// requirement: an event that went on sale last Saturday should drop out
// of "this week" the moment Monday turns over, not linger for a rolling
// 3 more days the way a lookback window would have it. Computed the same
// way as the day-window functions above (per-date offset lookup), so it
// stays correct even when the BST/GMT transition falls inside the week.
export function londonCalendarWeekWindow(now: Date): DateWindow {
  const todayParts = londonDateParts(now)
  // getUTCDay(): 0=Sun..6=Sat. Converted to "days since Monday" (Mon=0..Sun=6)
  // so Monday's own date can be found by pure calendar subtraction.
  const dow = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)).getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  const mondayParts = addCalendarDays(todayParts, -daysSinceMonday)
  const start = londonMidnightUTCForDate(mondayParts)
  const end = londonMidnightUTCForDate(addCalendarDays(mondayParts, 7))
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

// ── Quality checks ───────────────────────────────────────────────────────

export interface TicketLinkableEvent {
  tickets_url:    string | null
  own_ticket_url: string | null
}

// Neither a Ticketmaster-sourced ticket URL nor a manually-set "own"
// ticket URL exists — every provider button this event's page would show
// falls back to a generic site-wide search link with nothing event-
// specific to point at.
export function hasNoUsableTicketLink(event: TicketLinkableEvent): boolean {
  return !event.tickets_url && !event.own_ticket_url
}

// Known provider "homepage, no search path" URLs. An artist-level
// provider link set to exactly one of these was never actually pointed at
// anything artist-specific — it's the same bare landing page a visitor
// with no link at all would be sent to by the public pages' own generic
// fallbacks (see src/app/events/[slug]/page.tsx's buildProviders(), which
// hardcodes the Eventim and Skiddle homepages as its fallback for *every*
// event — a separate, code-level instance of this same issue, not a
// per-row one, so it isn't counted here).
const PROVIDER_HOMEPAGES = new Set([
  'https://www.eventim.co.uk',
  'https://www.skiddle.com',
  'https://www.viagogo.co.uk',
  'https://www.stubhub.co.uk',
  'https://www.gigsberg.com',
  'https://www.vividseats.com',
  'https://www.seetickets.com',
  'https://www.axs.com',
  'https://www.gigantic.com',
])

// Matches after stripping a trailing slash and any query/hash, so
// "https://www.eventim.co.uk/", "https://www.eventim.co.uk?x=1" and
// "https://www.eventim.co.uk" all count as the same bare homepage.
export function isBareProviderHomepage(url: string | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '')
    return PROVIDER_HOMEPAGES.has(normalized)
  } catch {
    return false
  }
}

export interface ArtistProviderUrls {
  name:            string
  eventim_url:     string | null
  axs_url:         string | null
  gigantic_url:    string | null
  see_tickets_url: string | null
  viagogo_url:     string | null
  stubhub_url:     string | null
  gigsberg_url:    string | null
  vivid_seats_url: string | null
}

export interface BareHomepageFinding {
  artistName: string
  provider:   string
  url:        string
}

const PROVIDER_URL_FIELDS: { field: keyof Omit<ArtistProviderUrls, 'name'>; label: string }[] = [
  { field: 'eventim_url',     label: 'Eventim' },
  { field: 'axs_url',         label: 'AXS' },
  { field: 'gigantic_url',    label: 'Gigantic' },
  { field: 'see_tickets_url', label: 'See Tickets' },
  { field: 'viagogo_url',     label: 'Viagogo' },
  { field: 'stubhub_url',     label: 'StubHub' },
  { field: 'gigsberg_url',    label: 'Gigsberg' },
  { field: 'vivid_seats_url', label: 'Vivid Seats' },
]

export function findBareProviderHomepages(artists: ArtistProviderUrls[]): BareHomepageFinding[] {
  const findings: BareHomepageFinding[] = []
  for (const artist of artists) {
    for (const { field, label } of PROVIDER_URL_FIELDS) {
      const url = artist[field]
      if (isBareProviderHomepage(url)) {
        findings.push({ artistName: artist.name, provider: label, url: url as string })
      }
    }
  }
  return findings
}

export interface StaleCheckEvent {
  title:            string
  start_date:       string
  status:           string
  last_synced_at:   string | null
  ticketmaster_id:  string | null
}

// A bit more than the sync's 24h cadence (vercel.json: 02:00 UTC daily)
// before a Ticketmaster-sourced event's silence is "stale" rather than
// "just hasn't been touched by today's run yet".
export const STALE_SYNC_THRESHOLD_MS = 36 * 60 * 60 * 1000

// Only Ticketmaster-sourced events (ticketmaster_id set) are expected to
// be kept fresh by the daily sync — a manually-added local event has no
// such expectation and is never flagged here.
export function isStaleUpcomingEvent(event: StaleCheckEvent, now: number): boolean {
  if (!event.ticketmaster_id) return false
  if (new Date(event.start_date).getTime() < now) return false
  if (!event.last_synced_at) return true
  return now - new Date(event.last_synced_at).getTime() > STALE_SYNC_THRESHOLD_MS
}

// A cancelled/postponed event whose start date is still in the future —
// worth a human decision (pull it from cards? leave the cancelled badge?)
// rather than something that will quietly resolve itself once the date
// passes.
export function isCancelledOrPostponedButUpcoming(
  event: Pick<StaleCheckEvent, 'start_date' | 'status'>,
  now: number,
): boolean {
  if (new Date(event.start_date).getTime() < now) return false
  return event.status === 'cancelled' || event.status === 'postponed'
}

export interface ChangeTrackedEvent {
  updated_at: string
  created_at: string
}

export const RECENT_CHANGE_WINDOW_MS = 48 * 60 * 60 * 1000

// True only for an edit to an *existing* row, not the row's own creation —
// a fresh insert has updated_at effectively equal to created_at (same
// write), so a 60s gap is used to tell "just inserted" apart from "edited
// shortly after insert", without needing a separate audit-log table.
export function wasRecentlyChanged(event: ChangeTrackedEvent, now: number): boolean {
  const updated = new Date(event.updated_at).getTime()
  const created = new Date(event.created_at).getTime()
  if (updated - created < 60_000) return false
  return now - updated <= RECENT_CHANGE_WINDOW_MS
}

// ── Major tour announcements ─────────────────────────────────────────────

export interface TourAnnouncementArtist {
  created_at:  string
  is_featured: boolean
  onsale_date: string | null
}

// A tour just added to the system in the last 7 days...
export const NEW_ARTIST_WINDOW_MS = 7 * DAY_MS
// ...or a featured artist's on-sale date far enough out that it's past
// the "Coming Up" 7-day window but still worth advance notice.
export const MAJOR_TOUR_LOOKAHEAD_MS = 60 * DAY_MS

// Either signal qualifies on its own. `comingUpWindowEndISO` is the
// Coming Up section's own 7-day window end (from londonDaysAheadWindow),
// passed in rather than recomputed here, so the two sections can never
// silently disagree about where "the next 7 days" stops.
export function isMajorTourAnnouncement(
  artist: TourAnnouncementArtist,
  now: number,
  comingUpWindowEndISO: string,
): boolean {
  if (now - new Date(artist.created_at).getTime() <= NEW_ARTIST_WINDOW_MS) return true
  if (!artist.is_featured || !artist.onsale_date) return false
  const onsale = new Date(artist.onsale_date).getTime()
  const windowEnd = new Date(comingUpWindowEndISO).getTime()
  return onsale > windowEnd && onsale - now <= MAJOR_TOUR_LOOKAHEAD_MS
}

// ── News queue counts ─────────────────────────────────────────────────────

export interface NewsQueueCandidate {
  review_status:    string
  priority:         string
  intake_method:    string
  ai_review_status: string
}

export interface NewsQueueCounts {
  pending:              number
  highPriority:         number
  unreviewedUrlImports: number
  aiAwaitingReview:     number
  missingDestination:  number
}

// `hasNoDestination` is the caller's own per-candidate result from the
// real resolveCityNewsTargets (src/lib/newsPublishing.ts) — passed in
// rather than recomputed here, so "what counts as having a destination"
// has exactly one definition in the codebase, not a second one for the
// dashboard.
export function summarizeNewsQueue(
  candidates: NewsQueueCandidate[],
  hasNoDestination: (c: NewsQueueCandidate) => boolean,
): NewsQueueCounts {
  let pending = 0, highPriority = 0, unreviewedUrlImports = 0, aiAwaitingReview = 0, missingDestination = 0
  for (const c of candidates) {
    const unresolved = c.review_status === 'pending' || c.review_status === 'approved'
    if (c.review_status === 'pending') pending++
    if (c.priority === 'high' && unresolved) highPriority++
    if (c.intake_method === 'url_import' && c.review_status === 'pending') unreviewedUrlImports++
    if (c.ai_review_status === 'unreviewed') aiAwaitingReview++
    if (unresolved && hasNoDestination(c)) missingDestination++
  }
  return { pending, highPriority, unreviewedUrlImports, aiAwaitingReview, missingDestination }
}

// ── Shared status vocabulary ──────────────────────────────────────────────
//
// One vocabulary the whole dashboard uses to describe where an item
// stands, so News Queue items (and anything added to this dashboard
// later) are never each inventing their own ad hoc label set:
//   discovered    — the system found/suggested this automatically; no
//                    human has looked at it yet
//   needs_review  — sitting in the queue for a human decision
//   approved      — reviewed and approved, not yet published
//   published     — live
//   blocked       — rejected, or approved/pending but with a real problem
//                    (e.g. no publishing destination) that would need
//                    fixing before it could go out
export type IntelligenceItemStatus = 'discovered' | 'needs_review' | 'approved' | 'published' | 'blocked'

export function newsCandidateDashboardStatus(
  candidate: { review_status: string; intake_method: string; ai_review_status: string },
  hasBlockingIssue: boolean,
): IntelligenceItemStatus {
  if (candidate.review_status === 'published') return 'published'
  if (candidate.review_status === 'rejected') return 'blocked'
  if (hasBlockingIssue) return 'blocked'
  if (candidate.review_status === 'approved') return 'approved'
  // pending, and not blocked:
  if (candidate.intake_method === 'url_import' && candidate.ai_review_status === 'unreviewed') return 'discovered'
  return 'needs_review'
}
