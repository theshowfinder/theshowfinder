// Who gets which "Just announced" story (cron: src/app/api/cron/news-alerts). Pure module (relative imports only)
// so it runs under `node --test`.
//
// A subscriber's email is built from what they told us:
//   - an act: followed on the site, or the show they signed up from (subscribers.interest)  -> "artist" stories
//   - a city: chosen at signup (subscribers.city), plus its nearby towns                     -> "city" stories
//   - nothing: only the biggest announcements (notable stories)                               -> "big" stories
// Personal stories lead; big ones fill up to MAX_PER_EMAIL. No story is ever sent to the same person twice.
// Not spam: at most one alert a day and ALERTS_PER_WEEK a week per person, and none on Mondays (the weekly digest).
import { actTitle } from './venueFamily.ts'
import { getNearbyAreas } from './nearbyAreas.ts'

export const MAX_PER_EMAIL = 3
export const ALERTS_PER_WEEK = 3

export type MatchReason = 'artist' | 'city' | 'big'

export interface AlertStoryFacts {
  id: string
  slug: string
  artist_name: string | null
  score: number
  facts: { cities?: string[] | null; artistSlug?: string | null; notable?: boolean | null } | null
}

export interface AlertSubscriber {
  email: string
  city: string | null
  /** Acts the person follows or signed up from: names (free text) and artist slugs. */
  actNames: string[]
  artistSlugs: string[]
}

export interface PlannedStory<S extends AlertStoryFacts> { story: S; reason: MatchReason; label: string }

/** Past alerts for one person: when, and which stories. */
export interface AlertHistory { sentAt: string[]; storyIds: Set<string> }

const words = (s: string) => s.split(' ').filter(Boolean)

/** The act the person named is the story's act ("Urzila Carlson - That's Enough Already" -> Urzila Carlson). */
export function sameAct(interest: string, artist: string | null | undefined): boolean {
  const a = actTitle(interest), b = actTitle(artist)
  if (a.length < 3 || b.length < 3) return false
  if (a === b) return true
  // One is the other's leading words ("Shania Twain" / "Shania Twain Live"), never a lone short word.
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return words(s).length >= 2 && (l + ' ').startsWith(s + ' ')
}

/** The cities a story's tour plays, matched to a subscriber's city or its nearby towns. */
export function playsNear(storyCities: string[] | null | undefined, city: string | null): string | null {
  if (!city || !storyCities?.length) return null
  const want = new Set([city, ...getNearbyAreas(city).flatMap(a => a.match)].map(c => c.toLowerCase()))
  return storyCities.find(c => want.has(c.toLowerCase())) ?? null
}

export function matchStory<S extends AlertStoryFacts>(sub: AlertSubscriber, story: S): PlannedStory<S> | null {
  const slug = story.facts?.artistSlug ?? null
  if ((slug && sub.artistSlugs.includes(slug)) || sub.actNames.some(n => sameAct(n, story.artist_name))) {
    return { story, reason: 'artist', label: `Because you were looking at ${story.artist_name}` }
  }
  const near = playsNear(story.facts?.cities, sub.city)
  if (near) return { story, reason: 'city', label: near.toLowerCase() === (sub.city ?? '').toLowerCase() ? `Coming to ${near}` : `Coming to ${near}, near ${sub.city}` }
  if (story.facts?.notable) return { story, reason: 'big', label: 'Big announcement' }
  return null
}

const RANK: Record<MatchReason, number> = { artist: 0, city: 1, big: 2 }

/** UK calendar day of an instant, YYYY-MM-DD. */
export function ukDay(at: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
}
export function isUkMonday(at: Date): boolean {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(at) === 'Mon'
}

/** Why this person gets nothing this run, or null when an alert may go. */
export function capReason(history: AlertHistory, now: Date): string | null {
  if (isUkMonday(now)) return 'monday (weekly digest day)'
  const today = ukDay(now)
  if (history.sentAt.some(t => ukDay(t) === today)) return 'already had an alert today'
  const weekAgo = now.getTime() - 7 * 86_400_000
  if (history.sentAt.filter(t => new Date(t).getTime() > weekAgo).length >= ALERTS_PER_WEEK) return `already had ${ALERTS_PER_WEEK} this week`
  return null
}

/** The stories one person should get now, best first (empty = no email). */
export function planAlert<S extends AlertStoryFacts>(sub: AlertSubscriber, stories: S[], history: AlertHistory, now: Date): PlannedStory<S>[] {
  if (capReason(history, now)) return []
  return stories
    .filter(s => !history.storyIds.has(s.id))
    .map(s => matchStory(sub, s))
    .filter((p): p is PlannedStory<S> => p !== null)
    .sort((a, b) => RANK[a.reason] - RANK[b.reason] || b.story.score - a.story.score)
    .slice(0, MAX_PER_EMAIL)
}
