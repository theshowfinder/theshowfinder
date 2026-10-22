// Our own headline news: a story with an image and its own page (/news/<slug>) for every tour or batch of dates
// that has just been announced, built from our ticket listings. The homepage headline strip shows the newest
// headline-worthy stories first; alert emails go out for the same ones.
//
// "Just announced" is only claimed when it is true: a show only counts if it was listed in the last week AND its
// general sale or presale has not started yet (or started in the last two days). That keeps out tours we only
// discovered late, whose tickets have been on sale for months.
//
// This file is pure (no I/O) so every rule is unit-tested; src/lib/newsStoriesJob.ts does the reading/writing.

import { CITIES } from './cities.ts'
import { NON_NEWSWORTHY_CATEGORIES, isNewsworthyArtistName, ukDay, SITE_URL } from './newShows.ts'

export const STORY_LISTED_WITHIN_DAYS = 7
/** A sale that opened up to this long ago still counts as "just announced". */
export const SALE_STARTED_GRACE_DAYS = 2
export const HEADLINE_MIN_SCORE = 50
const DAY = 86_400_000

export interface StoryEventRow {
  event_id: string
  event_slug: string | null
  title: string
  category: string | null
  start_date: string
  created_at: string
  public_onsale_start: string | null
  presale_start: string | null
  presale_name: string | null
  image_url: string | null
  venue_name: string | null
  venue_city: string | null
  venue_capacity: number | null
  artist_id: string | null
  artist_name: string | null
  artist_slug: string | null
  artist_image_url: string | null
  artist_created_at: string | null
  artist_wikipedia_url: string | null
}

export interface StoryDate {
  eventId: string
  eventSlug: string | null
  date: string
  city: string | null
  venue: string | null
  capacity: number | null
}

export type StoryType = 'tour_announcement' | 'new_dates'
export type VenueScale = 'stadium' | 'arena' | null

export interface StoryFacts {
  artistName: string
  artistSlug: string
  storyType: StoryType
  category: string | null
  dates: StoryDate[]
  cities: string[]
  dateCount: number
  cityCount: number
  firstDate: string
  lastDate: string
  /** Earliest general sale that has not started yet (or just started). */
  onsaleAt: string | null
  /** The general sale above has already opened (it started within the grace period). */
  onsaleStarted: boolean
  /** Only a presale that has not started yet. */
  presaleAt: string | null
  presaleName: string | null
  maxCapacity: number | null
  /** Stadium / arena when most of the dates are at venues that size. */
  scale: VenueScale
  hasStadiumDate: boolean
  notable: boolean
}

export interface StoryDraft {
  dedupeKey: string
  slug: string
  artistId: string
  artistName: string
  artistSlug: string
  storyType: StoryType
  facts: StoryFacts
  imageUrl: string | null
  score: number
  isHeadline: boolean
  templateHeadline: string
  hookTemplate: string
  standfirst: string
}

// Listings that are add-ons rather than shows (hospitality, parking, upgrades).
const ADD_ON_TITLE = /premium packages?|hospitality|\bparking\b|vip (package|upgrade|experience)|venue premium|upgrade\b|meet\s*&?\s*greet|soundcheck|\bsuites?\b|\bboxes?\b|\blounge\b|dining|gift card|voucher/i
// Festival and promoter series names ("American Express Presents BST Hyde Park") are not the act people are
// reading about; their headliners are announced under the act's own name.
const SERIES_NAME = /\bbst hyde park\b|\bfestival\b|\bfest\b|\bpresents bst\b|\bsummer series\b|\bconcert series\b/i

function isFreshSale(row: StoryEventRow, now: number): boolean {
  const since = now - SALE_STARTED_GRACE_DAYS * DAY
  const general = row.public_onsale_start ? Date.parse(row.public_onsale_start) : NaN
  const presale = row.presale_start ? Date.parse(row.presale_start) : NaN
  return (Number.isFinite(general) && general > since) || (Number.isFinite(presale) && presale > since)
}

export function isStoryEligibleRow(row: StoryEventRow, now: number): boolean {
  if (!row.artist_id || !row.artist_name || !row.artist_slug) return false
  if (NON_NEWSWORTHY_CATEGORIES.has(row.category ?? '')) return false
  if (row.category === 'local') return false
  if (!isNewsworthyArtistName(row.artist_name) || ADD_ON_TITLE.test(row.title) || ADD_ON_TITLE.test(row.artist_name)) return false
  if (SERIES_NAME.test(row.artist_name)) return false
  if (Date.parse(row.start_date) <= now) return false
  if (Date.parse(row.created_at) < now - STORY_LISTED_WITHIN_DAYS * DAY) return false
  return isFreshSale(row, now)
}

/** "oasis-Z9171fw7" → "oasis" (artist slugs carry the Ticketmaster id). */
export function baseArtistSlug(slug: string): string {
  const parts = slug.split('-')
  if (parts.length > 1 && /^(?=.*\d)[A-Za-z0-9]{6,}$/.test(parts[parts.length - 1]) && /[A-Z]/.test(parts[parts.length - 1])) {
    parts.pop()
  }
  return parts.join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'artist'
}

export function monthKey(iso: string | number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(new Date(iso))
}

const MONTH_SLUG = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function slugifyName(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '') || 'artist'
}

export function storySlug(artistName: string, storyType: StoryType, now: number): string {
  const [y, m] = monthKey(now).split('-')
  const what = storyType === 'tour_announcement' ? 'uk-tour-dates-announced' : 'new-uk-dates-announced'
  return `${slugifyName(artistName)}-${what}-${MONTH_SLUG[Number(m) - 1]}-${y}`
}

// Many venues have no capacity in our data. For scoring and the stadium/arena wording only, the big UK rooms are
// recognised by name (never shown as a number).
const STADIUM_NAME = /\bstadium\b|^wembley|st\.? james'? park|hampden|principality|murrayfield|anfield|old trafford|villa park|etihad|tottenham hotspur|london stadium|emirates stadium|hyde park|finsbury park|heaton park|bellahouston|knebworth/i
const ARENA_NAME = /\barena\b|\bhydro\b|^the o2$|co-op live|bp pulse live|first direct|motorpoint|connexin live|p&j live|exhibition centre liverpool|m&s bank|ovo wembley|sse arena|alexandra palace/i
export function estimatedCapacity(venue: string | null): number | null {
  if (!venue || /academy|institute|ritz|forum|apollo/i.test(venue)) return null
  if (STADIUM_NAME.test(venue)) return 40_000
  if (ARENA_NAME.test(venue)) return 10_000
  return null
}

function venueScaleOf(cap: number | null): VenueScale {
  if (!cap) return null
  if (cap >= 40_000) return 'stadium'
  if (cap >= 8_000) return 'arena'
  return null
}

/** One entry per city per UK day: listings repeat for presale, premium and early/late variants. */
export function dedupeStoryDates(dates: StoryDate[]): StoryDate[] {
  const byKey = new Map<string, StoryDate>()
  for (const d of [...dates].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${(d.city ?? d.venue ?? '').toLowerCase()}|${ukDay(d.date)}`
    if (!byKey.has(key)) byKey.set(key, d)
  }
  return [...byKey.values()]
}

export function buildFacts(input: {
  artistName: string
  artistSlug: string
  storyType: StoryType
  category: string | null
  dates: StoryDate[]
  onsaleCandidates: (string | null)[]
  presaleCandidates: { at: string | null; name: string | null }[]
  notable: boolean
  now: number
}): StoryFacts {
  const dates = dedupeStoryDates(input.dates)
  const cities = [...new Set(dates.map(d => d.city).filter(Boolean) as string[])]
  const caps = dates.map(d => d.capacity ?? estimatedCapacity(d.venue) ?? 0)
  const maxCapacity = caps.length && Math.max(...caps) > 0 ? Math.max(...caps) : null
  const since = input.now - SALE_STARTED_GRACE_DAYS * DAY
  const future = (iso: string | null) => !!iso && Date.parse(iso) > since
  const onsaleAt = input.onsaleCandidates.filter(future).sort()[0] ?? null
  const upcoming = (iso: string | null) => !!iso && Date.parse(iso) > input.now
  const presale = input.presaleCandidates.filter(p => upcoming(p.at)).sort((a, b) => a.at!.localeCompare(b.at!))[0]
  // A presale that only opens after general sale is not worth leading with.
  const presaleAt = presale && (!onsaleAt || presale.at! < onsaleAt) ? presale.at : null
  const scales = dates.map(d => venueScaleOf(d.capacity ?? estimatedCapacity(d.venue)))
  const stadiums = scales.filter(s => s === 'stadium').length
  const bigs = scales.filter(Boolean).length
  const scale: VenueScale = stadiums * 2 > dates.length ? 'stadium' : bigs * 2 > dates.length ? 'arena' : null
  return {
    artistName: input.artistName,
    artistSlug: input.artistSlug,
    storyType: input.storyType,
    category: input.category,
    dates,
    cities,
    dateCount: dates.length,
    cityCount: cities.length,
    firstDate: dates[0]?.date ?? '',
    lastDate: dates[dates.length - 1]?.date ?? '',
    onsaleAt,
    onsaleStarted: !!onsaleAt && Date.parse(onsaleAt) <= input.now,
    presaleAt: presaleAt ?? null,
    presaleName: presaleAt ? cleanPresaleName(presale!.name) : null,
    maxCapacity,
    scale,
    hasStadiumDate: stadiums > 0,
    notable: input.notable,
  }
}

function cleanPresaleName(name: string | null): string | null {
  if (!name) return null
  const n = name.replace(/\s+/g, ' ').trim()
  return n.length > 0 && n.length <= 40 ? n : null
}

export function storyScore(f: StoryFacts): number {
  const cap = f.maxCapacity ?? 0
  const capScore = cap >= 40_000 ? 50 : cap >= 10_000 ? 35 : cap >= 5_000 ? 25 : cap >= 2_000 ? 15 : cap >= 800 ? 8 : 0
  // Venue size is the best sign of how big the news is, so it weighs most; long theatre tours should not outrank
  // a stadium announcement just by having more dates.
  return capScore * 1.5
    + Math.min(f.dateCount, 12) * 1.5
    + Math.min(f.cityCount, 8) * 2
    + (f.storyType === 'tour_announcement' ? 10 : 0)
    + (f.notable ? 10 : 0)
}

export function isStoryWorthy(f: StoryFacts): boolean {
  return f.dateCount >= 2 || (f.maxCapacity ?? 0) >= 5_000
}

// ── Wording ──────────────────────────────────────────────────────────────────

const TZ = 'Europe/London'
export function saleDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso))
}
export function longDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(iso))
}
export function clockLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).formatToParts(new Date(iso))
  const h = parts.find(p => p.type === 'hour')?.value ?? ''
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  const ap = (parts.find(p => p.type === 'dayPeriod')?.value ?? '').toLowerCase().replace(/\./g, '')
  return m === '00' ? `${h}${ap}` : `${h}:${m}${ap}`
}
export function monthYearLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso))
}

function scaleWord(f: StoryFacts): string {
  return f.scale === 'stadium' ? 'stadium ' : f.scale === 'arena' ? 'arena ' : ''
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The plain, factual title: used for search results and as the page <title>. */
export function templateHeadline(f: StoryFacts): string {
  const y1 = new Date(f.firstDate).getUTCFullYear()
  const y2 = new Date(f.lastDate).getUTCFullYear()
  const years = y1 === y2 ? `${y1}` : `${y1}-${y2}`
  return f.dateCount === 1
    ? `${f.artistName} ${f.dates[0].city ?? 'UK'} ${years}: date, venue and how to get tickets`
    : `${f.artistName} UK tour ${years}: dates, venues and how to get tickets`
}

/** A punchier hook built only from facts: used whenever the AI hook is unavailable or fails its checks. */
export function hookTemplate(f: StoryFacts): string {
  const one = f.dates[0]
  const what = f.dateCount === 1
    ? one.city && one.venue ? `${one.city} show at ${one.venue}` : `${one.venue ?? one.city ?? 'UK'} show`
    : f.storyType === 'tour_announcement' ? `UK ${scaleWord(f)}tour` : `${f.dateCount} new UK dates`
  const verb = f.storyType === 'tour_announcement' || f.dateCount === 1 ? 'announces' : 'adds'
  const lead = `${f.artistName} ${verb} ${what}`
  if (f.presaleAt) return `${lead}: presale opens ${saleDayLabel(f.presaleAt)}`
  if (f.onsaleAt && f.onsaleStarted) return `${lead}: tickets on sale now`
  if (f.onsaleAt) return `${lead}: tickets on sale ${saleDayLabel(f.onsaleAt)}`
  return lead
}

export function standfirstFor(f: StoryFacts): string {
  const venues = [...new Set(
    [...f.dates].sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0)).map(d => d.venue).filter(Boolean) as string[],
  )].slice(0, 2)
  const span = monthYearLabel(f.firstDate) === monthYearLabel(f.lastDate)
    ? `in ${monthYearLabel(f.firstDate)}`
    : `from ${monthYearLabel(f.firstDate)} to ${monthYearLabel(f.lastDate)}`
  const where = f.dateCount === 1
    ? `${f.artistName} will play ${f.dates[0].venue ?? f.dates[0].city ?? 'the UK'}${f.dates[0].city && f.dates[0].venue ? ` in ${f.dates[0].city}` : ''} on ${longDayLabel(f.firstDate)} ${new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TZ }).format(new Date(f.firstDate))}.`
    : `${f.artistName} ${f.storyType === 'tour_announcement' ? 'has announced' : 'has added'} ${f.dateCount} UK dates across ${f.cityCount} ${f.cityCount === 1 ? 'city' : 'cities'} ${span}${venues.length ? `, including ${joinNatural(venues)}` : ''}.`
  const sale = [
    f.presaleAt ? `${f.presaleName ? `The ${f.presaleName}` : 'A presale'} opens ${longDayLabel(f.presaleAt)} at ${clockLabel(f.presaleAt)}.` : '',
    f.onsaleAt
      ? f.onsaleStarted
        ? `General sale opened ${longDayLabel(f.onsaleAt)} at ${clockLabel(f.onsaleAt)}.`
        : `General sale starts ${longDayLabel(f.onsaleAt)} at ${clockLabel(f.onsaleAt)}.`
      : '',
  ].filter(Boolean).join(' ')
  return [where, sale].filter(Boolean).join(' ')
}

// ── Grouping ─────────────────────────────────────────────────────────────────

export function buildStoryDrafts(rows: StoryEventRow[], now: number): StoryDraft[] {
  const groups = new Map<string, StoryEventRow[]>()
  for (const r of rows) {
    if (!isStoryEligibleRow(r, now)) continue
    const list = groups.get(r.artist_id!) ?? []
    list.push(r)
    groups.set(r.artist_id!, list)
  }
  const drafts: StoryDraft[] = []
  for (const [artistId, list] of groups) {
    const first = list[0]
    const isBrandNew = !!first.artist_created_at && now - Date.parse(first.artist_created_at) <= STORY_LISTED_WITHIN_DAYS * DAY
    const storyType: StoryType = isBrandNew ? 'tour_announcement' : 'new_dates'
    const facts = buildFacts({
      artistName: first.artist_name!,
      artistSlug: first.artist_slug!,
      storyType,
      category: mostCommon(list.map(r => r.category)),
      dates: list.map(r => ({ eventId: r.event_id, eventSlug: r.event_slug, date: r.start_date, city: r.venue_city, venue: r.venue_name, capacity: r.venue_capacity })),
      onsaleCandidates: list.map(r => r.public_onsale_start),
      presaleCandidates: list.map(r => ({ at: r.presale_start, name: r.presale_name })),
      notable: !!first.artist_wikipedia_url,
      now,
    })
    if (!isStoryWorthy(facts)) continue
    drafts.push(draftFromFacts(artistId, facts, storyImage(list), now))
  }
  return drafts.sort((a, b) => b.score - a.score)
}

export function draftFromFacts(artistId: string, facts: StoryFacts, imageUrl: string | null, now: number): StoryDraft {
  const score = storyScore(facts)
  return {
    dedupeKey: `artist:${artistId}:${monthKey(now)}`,
    slug: storySlug(facts.artistName, facts.storyType, now),
    artistId,
    artistName: facts.artistName,
    artistSlug: facts.artistSlug,
    storyType: facts.storyType,
    facts,
    imageUrl,
    score,
    isHeadline: score >= HEADLINE_MIN_SCORE,
    templateHeadline: templateHeadline(facts),
    hookTemplate: hookTemplate(facts),
    standfirst: standfirstFor(facts),
  }
}

/** Re-running keeps every date a story has ever listed (shows age out of the 7-day window, the story does not). */
export function mergeFacts(previous: StoryFacts, next: StoryFacts, now: number): StoryFacts {
  const byId = new Map<string, StoryDate>()
  for (const d of [...previous.dates, ...next.dates]) byId.set(d.eventId, d)
  return buildFacts({
    artistName: next.artistName,
    artistSlug: next.artistSlug,
    storyType: previous.storyType,
    category: next.category ?? previous.category,
    dates: [...byId.values()],
    onsaleCandidates: [previous.onsaleAt, next.onsaleAt],
    presaleCandidates: [{ at: previous.presaleAt, name: previous.presaleName }, { at: next.presaleAt, name: next.presaleName }],
    notable: previous.notable || next.notable,
    now,
  })
}

function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function storyImage(list: StoryEventRow[]): string | null {
  return list[0].artist_image_url ?? list.find(r => r.image_url)?.image_url ?? null
}

/** Ticketmaster image URLs come in sizes; the 2048px 16:9 one makes a sharp homepage lead. */
export function largeImageCandidate(url: string | null): string | null {
  if (!url || !/ticketm\.net\//.test(url)) return null
  const m = /_(TABLET_LANDSCAPE|RETINA_LANDSCAPE|RECOMENDATION|EVENT_DETAIL_PAGE)(?:_LARGE)?_16_9\.(jpg|png)$/i.exec(url)
  return m ? url.replace(m[0], `_TABLET_LANDSCAPE_LARGE_16_9.${m[2]}`) : null
}

export function storyUrl(slug: string): string {
  return `${SITE_URL}/news/${slug}`
}

// ── Homepage ordering ────────────────────────────────────────────────────────

export interface ListedStory { published_at: string; score: number }

/** Newest first; stories from the same run (same hour) go biggest first. */
export function orderStories<T extends ListedStory>(stories: T[]): T[] {
  const hour = (iso: string) => Math.floor(Date.parse(iso) / 3_600_000)
  return [...stories].sort((a, b) => hour(b.published_at) - hour(a.published_at) || b.score - a.score)
}

export const CITY_NAMES = CITIES.map(c => c.name)
