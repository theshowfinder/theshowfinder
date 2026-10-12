// Ticketmaster lists timed-entry attractions (Twist Museum, The Chimney Lift,
// London Eye, ...) as one event per time slot — sometimes 40+ a day. They have
// near-identical titles and add nothing but noise to listings, counts, search
// and the sitemap. A real show has at most a matinee and an evening
// performance (occasionally a third), so we keep a small number of
// performances per title + venue + London calendar day and skip the rest.
//
// Pure module (no '@/' imports) so it runs under `node --test`.

export const MAX_PERFORMANCES_PER_DAY = 2

export function normalizeSlotTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function londonDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export interface SiblingCandidate {
  title: string
  start_date: string
}

// How many of `siblings` (events already stored at the same venue) share the
// candidate's normalized title and London calendar day.
export function countSlotSiblings(candidate: SiblingCandidate, siblings: SiblingCandidate[]): number {
  const title = normalizeSlotTitle(candidate.title)
  if (!title) return 0
  const day = londonDay(candidate.start_date)
  return siblings.filter(
    s => normalizeSlotTitle(s.title) === title && londonDay(s.start_date) === day,
  ).length
}

// True when adding `candidate` would push the title + venue + London-day group
// past `max`.
export function exceedsSlotCap(
  candidate: SiblingCandidate,
  siblings: SiblingCandidate[],
  max: number = MAX_PERFORMANCES_PER_DAY,
): boolean {
  return countSlotSiblings(candidate, siblings) >= max
}

// Window wide enough to contain every event on the same London day as `iso`
// (the caller narrows to the exact day with exceedsSlotCap).
export function sameDayWindow(iso: string): { from: string; to: string } {
  const t = new Date(iso).getTime()
  const DAY = 24 * 60 * 60 * 1000
  return { from: new Date(t - DAY).toISOString(), to: new Date(t + DAY).toISOString() }
}
