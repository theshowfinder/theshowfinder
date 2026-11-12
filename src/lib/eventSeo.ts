// Search-result title and description for event pages. Pure (no imports) so `node --test` runs it.
//
// Search Console (12 Nov 2026): our best-converting searches are "<act> <venue/city> set times / stage times /
// start time / who is supporting" (46 queries, ~5% click rate, positions 2–9), because event pages already answer
// them (doors, listed start, support acts, set-times FAQ). So:
//  • a show in the next 30 days says "Set Times & Tickets" in its title (when it fits), and
//  • the description leads with the facts people want: date, doors, start, support.
// Nothing invented: only times and acts we hold.

/** The root layout appends " | TheShowFinder" (16 chars); keep our part to about 60. */
const TITLE_BUDGET = 60
const DESC_BUDGET = 158
export const SET_TIMES_WINDOW_DAYS = 30

export function eventSeoTitle(a: { title: string; venueStr: string | null; venueName?: string | null; shortDate: string; daysAway: number }): string {
  const base = a.venueStr ? `${a.title} at ${a.venueStr} – ${a.shortDate}` : `${a.title} – ${a.shortDate}`
  if (a.daysAway < 0 || a.daysAway > SET_TIMES_WINDOW_DAYS) return base
  const options = [
    a.venueStr ? `${a.title}, ${a.venueStr}: Set Times & Tickets – ${a.shortDate}` : null,
    a.venueName ? `${a.title}, ${a.venueName}: Set Times – ${a.shortDate}` : null,
    `${a.title}: Set Times & Tickets – ${a.shortDate}`,
    `${a.title} Set Times – ${a.shortDate}`,
  ].filter((o): o is string => Boolean(o))
  return options.find(o => o.length <= TITLE_BUDGET) ?? base
}

function joinNames(n: string[]): string {
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

export function eventSeoDescription(a: { title: string; venueName: string | null; city: string | null; dateStr: string; doors: string | null; start: string | null; support?: string[] | null }): string {
  const where = a.venueName ? ` at ${a.venueName}${a.city && !a.venueName.toLowerCase().includes(a.city.toLowerCase()) ? `, ${a.city}` : ''}` : ''
  const times = a.doors && a.start ? ` Doors ${a.doors}, show ${a.start}.` : a.start ? ` Starts ${a.start}.` : a.doors ? ` Doors ${a.doors}.` : ''
  const support = a.support?.length ? ` With ${joinNames(a.support.slice(0, 2))}.` : ''
  const tail = a.doors || a.start || a.support?.length ? ' Set times, support and tickets from official sellers.' : ' Find tickets from official sellers.'
  const full = `${a.title}${where} on ${a.dateStr}.${times}${support}${tail}`
  if (full.length <= DESC_BUDGET) return full
  const shorter = `${a.title}${where} on ${a.dateStr}.${times}${support}`
  return shorter.length <= DESC_BUDGET ? shorter : `${a.title}${where} on ${a.dateStr}.${times}`.slice(0, DESC_BUDGET)
}
