// A short, factual intro for a city page that has no hand-written guide text.
// Built from the city's own numbers (shows, venues, busiest types) so every
// city page reads differently instead of sharing one template sentence.

const TYPE_WORDS: Record<string, string> = {
  concert: 'concerts', theatre: 'theatre', comedy: 'comedy', sports: 'sport', family: 'family shows',
}

export type AutoIntroInput = {
  cityName: string
  totalCount: number
  venues: Array<{ name: string }>
  categoryCounts: Record<string, number | null>
  tonightCount: number
  weekendCount: number
}

function list(words: string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export function cityAutoIntro(i: AutoIntroInput): string | null {
  if (i.totalCount <= 0) return null
  const parts: string[] = []
  const venueNames = i.venues.slice(0, 3).map(v => v.name)
  parts.push(
    venueNames.length
      ? `${i.cityName} has ${i.totalCount.toLocaleString('en-GB')} upcoming ${i.totalCount === 1 ? 'show' : 'shows'} across ${i.venues.length} ${i.venues.length === 1 ? 'venue' : 'venues'}, led by ${list(venueNames)}.`
      : `${i.cityName} has ${i.totalCount.toLocaleString('en-GB')} upcoming ${i.totalCount === 1 ? 'show' : 'shows'}.`,
  )
  const busiest = Object.entries(i.categoryCounts)
    .filter(([k, n]) => TYPE_WORDS[k] && typeof n === 'number' && n > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([k]) => TYPE_WORDS[k])
  if (busiest.length >= 2) parts.push(`Most of what's on is ${list(busiest)}.`)
  if (i.tonightCount > 0 && i.weekendCount > 0) parts.push(`There's something on tonight, and ${i.weekendCount} ${i.weekendCount === 1 ? 'show' : 'shows'} this weekend.`)
  else if (i.weekendCount > 0) parts.push(`${i.weekendCount} ${i.weekendCount === 1 ? 'show is' : 'shows are'} on this weekend.`)
  parts.push('Compare every seller for each show, from the official box office to resale.')
  return parts.join(' ')
}
