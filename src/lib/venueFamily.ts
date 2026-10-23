// Venue families: rooms of one building ("O2 Academy Birmingham" / "O2 Academy2 Birmingham" / "O2 Academy3
// Birmingham", "O2 Institute 1/2/3", "<Venue> Upstairs" / "Downstairs" / "The Studio") are one place.
// Ticketmaster and TicketWeb sometimes list the same gig twice, each under a different room of the same building
// (Airbag, 23 Oct 2026: Ticketmaster in O2 Academy2, TicketWeb in O2 Academy), and the canonical grouping
// (event_canonical_map) only ever grouped by venue id, so the show appeared twice.
// Pure module (relative imports only) so it runs under `node --test`.
// A building match alone is never a duplicate: two different acts in Academy 1 and Academy 2 on the same night are
// two shows. See sameShow() for the act + date + time rules.

export interface VenueLike {
  id?: string | null
  name: string | null
  city?: string | null
  postcode?: string | null
  lat?: number | null
  lng?: number | null
}

const norm = (v: string | null | undefined) =>
  (v ?? '').toLowerCase().replace(/['’]/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

// Room / part-of-building words. Phrases first (so "main hall" goes before a lone word would).
const ROOM_PHRASES = [
  'second room', 'main room', 'main hall', 'main stage', 'small hall', 'great hall', 'tv studio', 'the studio', 'studio',
  'upstairs', 'downstairs', 'basement', 'ballroom', 'auditorium', 'bar', 'lounge', 'cellar', 'attic', 'courtyard', 'complex',
]
const NUMBER_WORD = '(?:\\d|one|two|three|four|i{1,3})'
// "Academy2", "Institute3", "Room 2", "Stage 2", "Hall 2" -> the building word only.
const NUMBERED_ROOM = new RegExp(`\\b(academy|institute|arena|room|stage|hall|studio|club|ritz)\\s*${NUMBER_WORD}\\b`, 'g')
const ROOM_PHRASE = new RegExp(`\\b(?:${ROOM_PHRASES.join('|')})\\b`, 'g')
const LONE_ROOM = /\b(room|stage)\b/g

/**
 * The building a venue name refers to, with room words and the town removed: "O2 Academy2 Birmingham" and
 * "O2 Academy Birmingham" both give "o2 academy". Empty when nothing distinctive is left.
 */
export function venueBuildingName(name: string | null | undefined, city?: string | null): string {
  let n = ` ${norm(name)} `
  // The town is not part of the building's name ("O2 Academy Birmingham").
  for (const word of norm(city).split(' ')) if (word.length > 2) n = n.replace(new RegExp(`\\s${word}\\s`, 'g'), ' ')
  n = n.replace(/\bformerly\b.*$/, ' ')
  n = n.replace(NUMBERED_ROOM, '$1')
  n = n.replace(ROOM_PHRASE, ' ').replace(LONE_ROOM, ' ')
  n = n.replace(/\b(the|at|of)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return n.length >= 2 ? n : ''
}

/** Normalised building key: town + building name. Same key = same building. Empty when unknown. */
export function venueFamilyKey(v: VenueLike): string {
  const b = venueBuildingName(v.name, v.city)
  return b ? `${norm(v.city)}|${b}` : ''
}

const POSTCODE = /^([a-z]{1,2}\d[a-z\d]?)\s*(\d[a-z]{2})$/
export function normalPostcode(v: string | null | undefined): string {
  const m = POSTCODE.exec(norm(v).replace(/\s+/g, ''))
  return m ? `${m[1]} ${m[2]}` : ''
}

export function metresApart(a: VenueLike, b: VenueLike): number | null {
  const ok = (v: VenueLike) => typeof v.lat === 'number' && typeof v.lng === 'number' && !(v.lat === 0 && v.lng === 0)
  if (!ok(a) || !ok(b)) return null
  const rad = Math.PI / 180
  const dLat = (b.lat! - a.lat!) * rad, dLng = (b.lng! - a.lng!) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * rad) * Math.cos(b.lat! * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export const SAME_BUILDING_METRES = 150

/** One building name inside the other ("Oran Mor" / "Oran Mor Auditorium", "Limelight" / "Limelight Complex"). */
function nameContains(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true   // "The O2" / "The O2" (only when the town, postcode or map also agree: see sameBuilding)
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < 6) return false
  return ` ${long} `.includes(` ${short} `)
}

/**
 * Why two venues are the same building, or null.
 *   'venue'    same venue id
 *   'name'     same building name once room words and the town are removed (or one name inside the other), and the
 *              same town, postcode or spot on the map: strong
 *   'postcode' / 'coords'  names unrelated, but the same postcode or within 150 m: weaker (neighbours share postcodes)
 * A shared town name alone is never a match ("O2 Academy" in Leeds and Birmingham are two buildings).
 */
export function sameBuilding(a: VenueLike, b: VenueLike): 'venue' | 'name' | 'postcode' | 'coords' | null {
  if (a.id && b.id && a.id === b.id) return 'venue'
  const pa = normalPostcode(a.postcode), pb = normalPostcode(b.postcode)
  const samePostcode = Boolean(pa && pa === pb)
  const m = metresApart(a, b)
  const close = m !== null && m <= SAME_BUILDING_METRES
  const sameTown = Boolean(norm(a.city) && norm(a.city) === norm(b.city))
  // Strip both towns from both names: TM says "Royal Concert Hall Nottingham", a council feed "Royal Concert Hall".
  const towns = [a.city, b.city].filter(Boolean).join(' ')
  const na = venueBuildingName(a.name, towns), nb = venueBuildingName(b.name, towns)
  if ((sameTown || samePostcode || close) && nameContains(na, nb)) return 'name'
  if (samePostcode) return 'postcode'
  if (close) return 'coords'
  return null
}

// ── The act ────────────────────────────────────────────────────────────────

/** Title reduced to the act: no "The", no bracketed notes, no tour name after " - " / ":". */
export function actTitle(title: string | null | undefined): string {
  const raw = (title ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  const head = raw.split(/\s[-–—|:]\s|:\s/)[0] ?? raw
  return norm(head).replace(/^the\s+/, '').replace(/\s+/g, ' ').trim()
}

/** Act name without a disambiguation note: "Airbag (Norway)" -> "airbag". */
export function actName(name: string | null | undefined): string {
  return norm((name ?? '').replace(/\([^)]*\)/g, ' ')).replace(/^the\s+/, '').trim()
}

// Titles that name a night, not an act: two rooms can run their own "Club Night" at the same time.
const GENERIC_TITLE = /^(live music|club night|comedy( club| night)?|quiz( night)?|karaoke|open mic|disco|silent disco|dj|jazz night|jam night|bingo|drag (brunch|bingo)|tribute night|student night|gig|showcase|the comedy store|comedy store|presents)$/

export interface ShowLike {
  id: string
  title: string
  start_date: string
  /** Linked acts: id and name. */
  artists?: { id: string; name: string | null; is_headliner?: boolean }[]
}

const LONDON_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
function londonParts(iso: string): { day: string; minutes: number | null } {
  const p = LONDON_TIME.formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  const minutes = Number(g('hour')) * 60 + Number(g('minute'))
  // Midnight London = "time not announced" site-wide.
  return { day: `${g('year')}-${g('month')}-${g('day')}`, minutes: minutes === 0 ? null : minutes }
}

export const SAME_SHOW_MINUTES = 30

/** Start time in minutes after midnight London, null when not announced (stored as midnight). */
export function londonStartMinutes(iso: string): number | null { return londonParts(iso).minutes }
export function londonDay(iso: string): string { return londonParts(iso).day }

/** `name` appears as whole words in `text` (both normalised); long names may run on ("#yaelokretour"). */
function mentions(text: string, name: string): boolean {
  if (name.length < 3) return false
  if (` ${text} `.includes(` ${name} `)) return true
  return name.length >= 6 && text.replace(/\s+/g, '').includes(name.replace(/\s+/g, ''))
}

/**
 * Whether two events are the same performance by the same act: same London day, start times within 30 minutes,
 * and the same act. The act is the same when the act titles are equal, or an act linked to either event is named
 * in BOTH titles (so a festival brand linked to two different gigs, "Celtic Connections", is not enough).
 *   'strong' = both times known and within 30 minutes, or one time not announced and identical act titles;
 *              never for generic night names ("Club Night", "Comedy Club")
 *   'weak'   = probably the same show; a person should check
 *   null     = different shows
 */
export function sameShow(a: ShowLike, b: ShowLike): 'strong' | 'weak' | null {
  const ta = londonParts(a.start_date), tb = londonParts(b.start_date)
  if (ta.day !== tb.day) return null
  const timeKnown = ta.minutes !== null && tb.minutes !== null
  if (timeKnown && Math.abs(ta.minutes! - tb.minutes!) > SAME_SHOW_MINUTES) return null
  const titleA = actTitle(a.title), titleB = actTitle(b.title)
  const sameTitle = titleA.length >= 2 && titleA === titleB
  const fullA = norm(a.title), fullB = norm(b.title)
  const names = new Set([...(a.artists ?? []), ...(b.artists ?? [])].map(x => actName(x.name)).filter(n => n.length >= 3))
  const namedInBoth = [...names].some(n => mentions(fullA, n) && mentions(fullB, n))
  if (!sameTitle && !namedInBoth) return null
  const generic = GENERIC_TITLE.test(titleA) || GENERIC_TITLE.test(titleB)
  if (generic) return 'weak'
  if (timeKnown) return 'strong'
  return sameTitle || titleA.startsWith(titleB) || titleB.startsWith(titleA) ? 'strong' : 'weak'
}

// ── Which copy to keep ────────────────────────────────────────────────────

export interface KeepCandidate {
  id: string
  created_at: string
  source: string | null
  ticketmaster_id: string | null
  tickets_url: string | null
  see_tickets_affiliate_url?: string | null
  gigsberg_affiliate_url?: string | null
  viagogo_url?: string | null
  stubhub_url?: string | null
  own_ticket_url?: string | null
  /** Ticketmaster extras saved by the sync (promoter, seatmapUrl, support, ticketLimit...). */
  details?: Record<string, unknown> | null
}

const TM_MAIN_SITE = /^https?:\/\/(www\.)?ticketmaster\.(co\.uk|ie)\//i

/** From the Ticketmaster sync (not a feed or council import). */
export function isFromTicketmaster(e: KeepCandidate): boolean {
  return !e.source && !!e.ticketmaster_id
}

/** The main Ticketmaster listing (ticketmaster.co.uk / .ie), not a TicketWeb / Universe / ticketmaster.com copy. */
export function isTicketmasterPrimary(e: KeepCandidate): boolean {
  return isFromTicketmaster(e) && TM_MAIN_SITE.test(e.tickets_url ?? '')
}

/**
 * How complete a Ticketmaster listing is. The main listing carries the promoter, ticket limit, seat map and support
 * acts and sells on ticketmaster.co.uk; the copies Ticketmaster passes on from TicketWeb ("1AdFZ_..." ids), Universe
 * and ticketmaster.com have none of them (Airbag, 23 Oct 2026: G5dzZ_amM-xPa full, 1AdFZ_aGkmb4vF6 bare).
 */
export function listingFullness(e: KeepCandidate): number {
  const d = e.details ?? {}
  return (TM_MAIN_SITE.test(e.tickets_url ?? '') ? 2 : 0)
    + (d.promoter ? 2 : 0)
    + (d.seatmapUrl ? 1 : 0)
    + (Array.isArray(d.support) && d.support.length ? 1 : 0)
    + (d.ticketLimit ? 1 : 0)
}

/** A Ticketmaster copy with none of the main listing's details. */
export function isBareTicketmasterCopy(e: KeepCandidate): boolean {
  return isFromTicketmaster(e) && !isTicketmasterPrimary(e) && !(e.details ?? {}).promoter
}

export function sellerLinkCount(e: KeepCandidate): number {
  return [e.tickets_url, e.see_tickets_affiliate_url, e.gigsberg_affiliate_url, e.viagogo_url, e.stubhub_url, e.own_ticket_url].filter(Boolean).length
}

/** Why `e` is kept, for reports. */
export function keepReason(e: KeepCandidate): string {
  if (isTicketmasterPrimary(e)) return `main Ticketmaster listing, fullest details (score ${listingFullness(e)})`
  if (isFromTicketmaster(e)) return `Ticketmaster listing, fullest details (score ${listingFullness(e)})`
  return `${sellerLinkCount(e)} seller link(s), oldest`
}

/**
 * The event to keep:
 *   1. a Ticketmaster listing over a feed / council copy;
 *   2. among Ticketmaster listings, the fullest one (main ticketmaster.co.uk listing with promoter, seat map, support)
 *      over a bare TicketWeb / Universe / ticketmaster.com copy;
 *   3. the most seller links;  4. the oldest (then lowest id, so the answer is stable).
 */
export function pickKeeper<T extends KeepCandidate>(events: T[]): T {
  return [...events].sort((x, y) =>
    Number(isFromTicketmaster(y)) - Number(isFromTicketmaster(x))
    || (isFromTicketmaster(x) && isFromTicketmaster(y) ? listingFullness(y) - listingFullness(x) : 0)
    || sellerLinkCount(y) - sellerLinkCount(x)
    || x.created_at.localeCompare(y.created_at)
    || x.id.localeCompare(y.id))[0]
}

// ── Finding duplicate groups ──────────────────────────────────────────────

export interface GroupEvent extends KeepCandidate, ShowLike {
  venue_id: string
  venue: VenueLike
}

export interface DuplicateGroup<T extends GroupEvent = GroupEvent> {
  /** Sorted event ids joined by ',' (event_merge_reviews.group_key). */
  key: string
  confident: boolean
  /** Why a person should check it (empty when confident). */
  reasons: string[]
  keep: T
  duplicates: T[]
  events: T[]
}

const words = (s: string) => s.split(' ').filter(Boolean)
/** Same act title, or one is the other's leading words ("Boyzlife" / "Boyzlife Featuring Keith Duffy"). */
export function titlesFullyMatch(a: string, b: string): boolean {
  const x = actTitle(a), y = actTitle(b)
  if (x === y) return x.length >= 2
  const [s, l] = x.length <= y.length ? [x, y] : [y, x]
  return words(s).length >= 1 && s.length >= 4 && (l + ' ').startsWith(s + ' ')
}

/**
 * Groups of events that are one show stored under two rooms / venue records of one building.
 * `events` must already be live, canonical, not packages, with their venue attached.
 * `isLocalSource(source)` says whether a source is a council / tourism feed: a council copy is only merged
 * when its start time is within 15 minutes of the kept event and its title fully matches.
 */
export function findDuplicateGroups<T extends GroupEvent>(events: T[], isLocalSource: (source: string | null) => boolean): DuplicateGroup<T>[] {
  const byDay = new Map<string, T[]>()
  for (const e of events) {
    const k = londonDay(e.start_date)
    const list = byDay.get(k)
    if (list) list.push(e); else byDay.set(k, [e])
  }
  const parent = new Map<string, string>()
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r }
  type Pair = { a: string; b: string; bld: NonNullable<ReturnType<typeof sameBuilding>>; show: 'strong' | 'weak' }
  const pairs: Pair[] = []
  for (const list of byDay.values()) {
    const mins = list.map(e => londonStartMinutes(e.start_date))
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      // Same venue record too: the older grouping (event_canonical_map) only joins identical titles, so "Placebo"
      // from a council feed and Ticketmaster's "Placebo - 30th Anniversary Tour" at Utilita Arena Cardiff fell
      // between the two. Events reaching here are already canonical, so nothing is grouped twice.
      // Two Ticketmaster products at the same venue record (hospitality, hotel bundles) stay as they are.
      if (a.venue_id === b.venue_id && !isLocalSource(a.source) && !isLocalSource(b.source)) continue
      if (mins[i] !== null && mins[j] !== null && Math.abs(mins[i]! - mins[j]!) > SAME_SHOW_MINUTES) continue
      const show = sameShow(a, b)
      if (!show) continue
      const bld = sameBuilding(a.venue, b.venue)
      if (!bld) continue
      pairs.push({ a: a.id, b: b.id, bld, show })
      parent.set(find(a.id), find(b.id))
    }
  }
  const byId = new Map(events.map(e => [e.id, e]))
  const sets = new Map<string, Set<string>>()
  for (const p of pairs) for (const id of [p.a, p.b]) {
    const r = find(id)
    const s = sets.get(r)
    if (s) s.add(id); else sets.set(r, new Set([id]))
  }
  return [...sets.values()].map(set => {
    const evs = [...set].map(id => byId.get(id)!)
    const gp = pairs.filter(p => set.has(p.a))
    const keep = pickKeeper(evs)
    const duplicates = evs.filter(e => e.id !== keep.id)
    const why: string[] = []
    if (gp.some(p => p.show === 'weak')) why.push('act not certain (start time not announced and titles differ, or a generic night name)')
    const loose = [...new Set(gp.filter(p => p.bld === 'postcode' || p.bld === 'coords').map(p => p.bld))]
    if (loose.length) why.push(`building matched only by ${loose.join('/')}`)
    if (evs.filter(isTicketmasterPrimary).length > 1) why.push('Ticketmaster itself lists it in more than one room')
    const times = evs.map(e => londonStartMinutes(e.start_date)).filter((m): m is number => m !== null)
    if (times.length && Math.max(...times) - Math.min(...times) > SAME_SHOW_MINUTES) why.push('copies start more than 30 minutes apart (two performances?)')
    if (duplicates.some(e => !gp.some(p => (p.a === e.id && p.b === keep.id) || (p.b === e.id && p.a === keep.id)))) why.push('not every copy matches the kept event directly')
    if (isLocalSource(keep.source)) why.push('the kept copy would be a council / tourism listing')
    const km = londonStartMinutes(keep.start_date)
    for (const d of duplicates.filter(e => isLocalSource(e.source))) {
      const dm = londonStartMinutes(d.start_date)
      if (km !== null && dm !== null && Math.abs(km - dm) > 15) why.push(`council copy starts ${Math.abs(km - dm)} min apart`)
      if (!titlesFullyMatch(keep.title, d.title)) why.push(`council copy title only partly matches ("${d.title}")`)
    }
    return { key: evs.map(e => e.id).sort().join(','), confident: why.length === 0, reasons: why, keep, duplicates, events: evs }
  })
}

// ── Extras (hotel bundles, camping, parking, VIP...) ─────────────────────────

const firstWord = (title: string) => norm(title).replace(/^(the|a|an)\s+/, '').split(' ')[0] ?? ''
const daysApart = (a: string, b: string) => Math.round(Math.abs(Date.parse(`${londonDay(a)}T12:00:00Z`) - Date.parse(`${londonDay(b)}T12:00:00Z`)) / 86_400_000)

export const EXTRA_WINDOW_DAYS = 4

/**
 * The main show each extra belongs to: same building, within 4 days (festival camping is often dated the eve),
 * the main show's first word is the extra's ("Download 2027 - Charge Candy" -> "Download Festival 2027"). The
 * nearest date wins, then the main whose whole title starts the extra's. Extras with no clear home are returned
 * with main = null, for a person to decide.
 */
export function findExtraHomes<T extends GroupEvent>(extras: T[], mains: T[]): { extra: T; main: T | null; why: string }[] {
  const byWord = new Map<string, T[]>()
  for (const m of mains) {
    const w = firstWord(m.title)
    if (w.length < 3) continue
    const list = byWord.get(w)
    if (list) list.push(m); else byWord.set(w, [m])
  }
  return extras.map(extra => {
    const w = firstWord(extra.title)
    const candidates = (byWord.get(w) ?? [])
      .filter(m => m.id !== extra.id && sameBuilding(m.venue, extra.venue) && daysApart(m.start_date, extra.start_date) <= EXTRA_WINDOW_DAYS)
    if (!candidates.length) return { extra, main: null, why: 'no main show at this venue within 4 days' }
    const extraNorm = norm(extra.title)
    const rank = (m: T) => [daysApart(m.start_date, extra.start_date), extraNorm.startsWith(norm(m.title)) ? 0 : 1, isTicketmasterPrimary(m) ? 0 : 1] as const
    const sorted = [...candidates].sort((a, b) => {
      const ra = rank(a), rb = rank(b)
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.id.localeCompare(b.id)
    })
    const [best, next] = sorted
    // Two different shows equally close (two acts sharing a first word at one venue): a person decides.
    if (next && rank(next)[0] === rank(best)[0] && rank(next)[1] === rank(best)[1] && actTitle(next.title) !== actTitle(best.title)) return { extra, main: null, why: 'two possible main shows' }
    return { extra, main: best, why: 'main show at the same venue' }
  })
}
