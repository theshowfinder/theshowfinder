// Suggests which site events an unlinked Gigsberg / See Tickets show might be, so a person can link
// it in one click. Pure: reuses the matcher's own scoring, but is deliberately looser than the
// automatic matcher (which must be sure). Same-day, same-city shows with a similar venue are offered
// even when the title wording differs (sponsor prefixes, "Live at", support acts), because a human
// makes the final call.
import { score, normalize, tokenOverlap, type CatalogueRow, type ShowfinderEvent } from './gigsbergMatchScoring.ts'

export interface Candidate {
  event: ShowfinderEvent
  value: number
  why: string[]
}

const GENERIC = new Set(['live', 'tour', 'presents', 'the', 'and', 'with', 'uk', 'show', 'concert', 'an', 'evening'])

/** Tokens that carry meaning: drops filler words so "Amex presents BST Hyde Park" shares "hyde park" with "BST Hyde Park". */
function meaningful(value: string) {
  return normalize(value).split(' ').filter(t => t.length > 2 && !GENERIC.has(t)).join(' ')
}

export function rankCandidates(row: CatalogueRow, events: ShowfinderEvent[], max = 4): Candidate[] {
  const out: Candidate[] = []
  for (const event of events) {
    const s = score(row, { ...event, artists: event.artists ?? [] })
    if (!s.sameDate) continue
    const looseTitle = Math.max(
      tokenOverlap(meaningful(row.name), meaningful(event.title)),
      tokenOverlap(meaningful(row.performer1 ?? ''), meaningful(event.title)),
    )
    const venueClose = s.sameVenue || s.venueOverlap >= 0.5
    const plausible = s.performerExact || s.performerOverlap >= 0.34 || looseTitle >= 0.34 || (s.sameCity && venueClose)
    if (!plausible) continue
    const why: string[] = []
    if (s.titlePerformerExact || s.linkedArtistExact) why.push('name matches')
    else if (Math.max(s.performerOverlap, looseTitle) >= 0.34) why.push('similar name')
    why.push('same day')
    if (s.sameVenue) why.push('same venue')
    else if (s.venueOverlap >= 0.5) why.push('similar venue')
    if (s.sameCity) why.push('same city')
    // rank: name evidence first, then venue, then city
    const value = s.value + (looseTitle * 0.2) + (venueClose ? 0.05 : 0)
    out.push({ event, value, why })
  }
  return out.sort((a, b) => b.value - a.value).slice(0, max)
}
