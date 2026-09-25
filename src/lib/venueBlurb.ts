// Short, factual venue descriptions generated from data we already have
// (capacity, city, upcoming event count/categories) — no manual content
// needed, so every venue gets one automatically as soon as it's synced.

const categoryNoun: Record<string, string> = {
  concert: 'concerts',
  theatre: 'theatre',
  comedy:  'comedy shows',
  sports:  'sports events',
  family:  'family shows',
}

// Short one-liner for compact venue cards (city pages).
export function venueCardBlurb(capacity: number | null, eventCount: number, cityName: string): string {
  const cap = capacity ? `${capacity.toLocaleString('en-GB')}-capacity ` : ''
  const shows = eventCount > 0
    ? `${eventCount} upcoming show${eventCount !== 1 ? 's' : ''}`
    : 'no shows currently listed'
  return `A ${cap}venue in ${cityName}, with ${shows}.`
}

// Fuller paragraph for the standalone venue page, using the actual mix of
// categories playing there so it reads as a real description rather than a
// template repeated on every venue.
export function venuePageDescription(
  name: string,
  cityName: string,
  capacity: number | null,
  categories: string[],
): string {
  const cap = capacity
    ? ` with a capacity of ${capacity.toLocaleString('en-GB')}`
    : ''

  const counts = new Map<string, number>()
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  const nouns = ranked.map(c => categoryNoun[c]).filter(Boolean)

  let known = ''
  if (nouns.length === 1) {
    known = ` Known for hosting ${nouns[0]}.`
  } else if (nouns.length === 2) {
    known = ` Known for hosting ${nouns[0]} and ${nouns[1]}.`
  } else if (nouns.length > 2) {
    known = ` Known for hosting ${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}.`
  }

  return `${name} is a live event venue in ${cityName}${cap}.${known}`
}
