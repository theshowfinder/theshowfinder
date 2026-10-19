// Mixing rules for "what's on" lists (This Week, Top Events, Tonight).
//
// A plain "soonest first" or "biggest first" sort lets one thing flood a list:
// timed-entry attractions (Madame Tussauds, London Eye, Twist Museum, ...) all
// start at 10:00 and fill the top of every day, and a single arena can supply
// every "Top Event". These helpers pick a varied set instead: one card per
// show, a cap per venue, a small cap on attractions, and (for This Week) a
// spread across days and categories.
//
// Pure module (no '@/' imports) so it runs under `node --test`.

import { londonDay, normalizeSlotTitle } from './timeSlotCap.ts'

export interface MixEvent {
  title: string
  start_date: string
  venue_id?: string | null
  venue_name?: string | null
  category?: string | null
}

// Venue / experience tickets that are not "a show on a night". Matched against
// the title and the venue name.
const ATTRACTION_NAMES = [
  'madame tussauds', 'london dungeon', 'london eye', 'sea life', 'sealife',
  'twist museum', 'chimney lift', "shrek's adventure", 'paddington bear experience',
  'cadbury world', 'alton towers', 'chessington', 'legoland', 'thorpe park',
  'warner bros. studio tour', 'warner bros studio tour', 'blackpool sandcastle',
  'blackpool tower', 'ramses and the pharaoh', 'face your fears', 'scream park',
  'the view from the shard', 'tower bridge exhibition', 'kidzania', 'drayton manor',
  'flamingo land', 'the old course', 'waterpark', 'water park', 'sandcastle waterpark',
]

// "Standard Entry", "Fast Track Experience", "Timed Entry", ...
const ATTRACTION_TITLE = /\b(standard|fast[\s-]?track|priority|timed|general)\s+(entry|admission|experience)\b/i

// Substrings for a database ILIKE pre-filter on the attractions hub (the
// isAttraction() check is still the real test).
export const ATTRACTION_SEARCH_TERMS: string[] = [
  ...ATTRACTION_NAMES.map(n => n.replace(/[,()*%]/g, ' ').trim()),
  'standard entry', 'standard experience', 'fast track', 'fasttrack', 'timed entry',
]

export function isAttraction(event: Pick<MixEvent, 'title' | 'venue_name'>): boolean {
  const hay = `${event.title} ${event.venue_name ?? ''}`.toLowerCase()
  if (ATTRACTION_NAMES.some(n => hay.includes(n))) return true
  return ATTRACTION_TITLE.test(event.title)
}

function venueKey(e: MixEvent): string {
  return e.venue_id ?? (e.venue_name ? e.venue_name.toLowerCase() : '')
}

export interface MixOptions {
  limit: number
  /** Max cards from one venue (default 3). */
  maxPerVenue?: number
  /** Max attraction cards in the list (default 2). */
  maxAttractions?: number
  /**
   * 'week': spread across London days and categories, shown soonest first.
   * 'ranked': keep the incoming (prominence) order.
   */
  mode?: 'week' | 'ranked'
}

// One card per show: later rows whose normalized title was already seen
// (e.g. "Alpha Wolf" / "ALPHA WOLF", repeated dates) are dropped.
function dedupeByTitle<T extends MixEvent>(pool: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const e of pool) {
    const key = normalizeSlotTitle(e.title) || e.title
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

// Round-robin across several ordered queues.
function interleave<T>(queues: T[][]): T[] {
  const out: T[] = []
  const max = Math.max(0, ...queues.map(q => q.length))
  for (let i = 0; i < max; i++) {
    for (const q of queues) if (i < q.length) out.push(q[i])
  }
  return out
}

// Within one day: alternate categories (concert, theatre, comedy, ...) so a
// day isn't all one kind of show. Pool order inside a category is preserved.
function interleaveCategories<T extends MixEvent>(dayEvents: T[]): T[] {
  const byCat = new Map<string, T[]>()
  for (const e of dayEvents) {
    const key = e.category ?? ''
    const q = byCat.get(key)
    if (q) q.push(e)
    else byCat.set(key, [e])
  }
  return interleave([...byCat.values()])
}

export function mixEvents<T extends MixEvent>(pool: T[], options: MixOptions): T[] {
  const { limit, maxPerVenue = 3, maxAttractions = 2, mode = 'week' } = options
  if (limit <= 0) return []

  const unique = dedupeByTitle(pool)
  const real = unique.filter(e => !isAttraction(e))
  const attractions = unique.filter(e => isAttraction(e))

  let ordered: T[]
  if (mode === 'week') {
    // Bucket by London day (days in date order), spread across days, then
    // across categories inside each day.
    const days = new Map<string, T[]>()
    for (const e of [...real].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
      const d = londonDay(e.start_date)
      const q = days.get(d)
      if (q) q.push(e)
      else days.set(d, [e])
    }
    const dayQueues = [...days.keys()].sort().map(d => interleaveCategories(days.get(d)!))
    ordered = interleave(dayQueues)
  } else {
    ordered = real
  }

  // Attractions queue up behind the real shows but may take a couple of slots;
  // they are merged by their position in the original pool order.
  const picked: T[] = []
  const pickedSet = new Set<T>()
  const venueCount = new Map<string, number>()
  const take = (e: T, enforceVenueCap: boolean): boolean => {
    if (pickedSet.has(e)) return false
    const vk = venueKey(e)
    if (enforceVenueCap && vk && (venueCount.get(vk) ?? 0) >= maxPerVenue) return false
    picked.push(e)
    pickedSet.add(e)
    if (vk) venueCount.set(vk, (venueCount.get(vk) ?? 0) + 1)
    return picked.length >= limit
  }

  // Reserve room for the allowed attractions, taken from the front of the
  // attraction list (pool order), then fill the rest with real shows.
  const attractionSlots = Math.min(maxAttractions, attractions.length, limit)
  const realTarget = limit - attractionSlots
  for (const e of ordered) {
    if (picked.length >= realTarget) break
    take(e, true)
  }
  // Backfill real shows that only missed because of the venue cap.
  if (picked.length < realTarget) {
    for (const e of ordered) {
      if (picked.length >= realTarget) break
      take(e, false)
    }
  }
  // Attractions (capped), then top up from them only if still short.
  let attractionsTaken = 0
  for (const e of attractions) {
    if (attractionsTaken >= attractionSlots || picked.length >= limit) break
    const before = picked.length
    take(e, true)
    if (picked.length > before) attractionsTaken++
  }
  if (picked.length < limit) {
    for (const e of attractions) {
      if (picked.length >= limit) break
      take(e, false)
    }
  }

  if (mode === 'week') {
    return picked.sort((a, b) => a.start_date.localeCompare(b.start_date))
  }
  // 'ranked': preserve incoming pool order.
  const rank = new Map(pool.map((e, i) => [e, i]))
  return picked.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
}

// Tonight stays chronological ("what's on, in order"), but attraction slots
// are collapsed to one entry per attraction (its earliest slot) and capped, so
// 10:00 entry tickets don't bury the evening's shows.
export function trimTonight<T extends MixEvent>(
  events: T[],
  { maxAttractions = 3, limit = 60 }: { maxAttractions?: number; limit?: number } = {},
): T[] {
  const seenAttraction = new Set<string>()
  const out: T[] = []
  for (const e of events) {
    if (isAttraction(e)) {
      const key = normalizeSlotTitle(e.title) || e.title
      if (seenAttraction.has(key) || seenAttraction.size >= maxAttractions) continue
      seenAttraction.add(key)
    }
    out.push(e)
    if (out.length >= limit) break
  }
  return out
}
