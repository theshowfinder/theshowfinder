// Pure logic for the Social Pack (Phase 7) — manual-review preparation of
// Facebook/Instagram/TikTok drafts for an approved, published city news
// story or an admin-flagged event update. Built generically (any city),
// validated against Manchester for this pilot phase. No '@/' imports and
// no npm packages, matching on-sale.ts/newsPublishing.ts — nothing in
// this file ever makes a network call or talks to a platform API; it
// only builds the record an admin action then writes to social_packs,
// and that record's own status always starts at 'draft'.

import { buildUtmUrl } from './analytics.ts'
import type { SocialPackSourceType, SocialPackStatus, NewsStoryType, EventStatus } from './types/database'

const SITE_ORIGIN = 'https://www.theshowfinder.com'

// ── Hashtags ───────────────────────────────────────────────────────────────
// Mirrors newsPublishing.ts's own (unexported) toHashtag exactly — a label
// -> single "#WordWord" token, letters/numbers only, title-cased per word.
function toHashtag(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
  if (!cleaned) return ''
  const words = cleaned.split(/\s+/)
  return '#' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

// `seed` is whatever's relevant to this pack — typically [cityName,
// artistOrEventName] — plus the story-type-style tag the caller already
// knows (e.g. 'Presale', 'TourAnnouncement'), passed in as plain words
// rather than re-deriving a NewsCandidate['story_type'] mapping here
// (this module has no NewsCandidate dependency, since a pack can equally
// come from an event). #TheShowFinder is always included; duplicates are
// naturally de-duplicated by the Set.
export function buildSocialPackHashtags(seed: string[]): string[] {
  const tags = new Set<string>()
  tags.add('#TheShowFinder')
  for (const label of seed) {
    const tag = toHashtag(label)
    if (tag) tags.add(tag)
  }
  return [...tags]
}

// ── Destination + UTM links ─────────────────────────────────────────────
// Same buildUtmUrl primitive the Share Kit already uses (analytics.ts) —
// one definition of how a tracked link is built, reused rather than
// duplicated.

export interface SocialPackLinks {
  destinationUrl: string
  utmCampaign:    string
  facebookLink:   string
  instagramLink:  string
  tiktokLink:     string
}

export function buildSocialPackLinks(
  destinationPath: string,
  sourceType: SocialPackSourceType,
  sourceId: string,
): SocialPackLinks {
  const destinationUrl = destinationPath.startsWith('http') ? destinationPath : `${SITE_ORIGIN}${destinationPath}`
  const utmCampaign = `social-${sourceType}-${sourceId}`
  return {
    destinationUrl,
    utmCampaign,
    facebookLink:  buildUtmUrl(destinationUrl, { source: 'facebook',  medium: 'social', campaign: utmCampaign }),
    instagramLink: buildUtmUrl(destinationUrl, { source: 'instagram', medium: 'social', campaign: utmCampaign }),
    tiktokLink:    buildUtmUrl(destinationUrl, { source: 'tiktok',    medium: 'social', campaign: utmCampaign }),
  }
}

// ── Platform captions ────────────────────────────────────────────────────
//
// Facebook captions are read in-feed with a clickable link attached, so a
// tracked URL belongs directly in the text. Instagram and TikTok captions
// are not clickable in-feed — a pasted URL just reads as dead text and
// makes the post look broken — so neither ever gets the raw link; both
// use "Link in bio" instead, the platforms' own convention. The tracked
// link itself is still stored (instagram_link/tiktok_link), for whichever
// bio-link tool it ends up pointed at.

export function buildFacebookCaption(headline: string, context: string, facebookLink: string): string {
  return `${headline}\n\n${context}\n\n${facebookLink}`
}

export function buildInstagramCaption(headline: string, context: string): string {
  return `${headline}\n\n${context}\n\n🔗 Link in bio`
}

const TIKTOK_MAX_LENGTH = 150

export function buildTikTokCaption(headline: string, context: string): string {
  const base = `${headline} — ${context} 🔗 Link in bio`
  return base.length > TIKTOK_MAX_LENGTH ? base.slice(0, TIKTOK_MAX_LENGTH - 3) + '...' : base
}

// ── Branded image: kind + vibrant themes ──────────────────────────────────
// Five distinct visual templates, matched to the kinds of posts
// TheShowFinder actually makes — tour announcements, onsales, presales,
// city-wide roundups and "tonight" posts — instead of one flat, minimal
// card reused for every story. Each kind gets its own two-colour gradient
// and accent so the five templates read as genuinely different at a
// glance, not relabelled copies of one design.
export type SocialImageKind = 'tour_announcement' | 'onsale' | 'presale' | 'city_event' | 'tonight'

const SOCIAL_IMAGE_KINDS: SocialImageKind[] = ['tour_announcement', 'onsale', 'presale', 'city_event', 'tonight']

export function isSocialImageKind(value: unknown): value is SocialImageKind {
  return typeof value === 'string' && (SOCIAL_IMAGE_KINDS as string[]).includes(value)
}

// A pack prepared before this template system existed (or one whose
// stored kind is somehow missing/invalid) always falls back to the
// generic city-wide template rather than the image route erroring or
// guessing — "safe fallback" applies to the template itself, not only
// to the background photo.
export function resolveStoredImageKind(stored: unknown): SocialImageKind {
  return isSocialImageKind(stored) ? stored : 'city_event'
}

export interface SocialImageTheme {
  badgeLabel:   string
  gradientFrom: string
  gradientTo:   string
  accent:       string
}

export const SOCIAL_IMAGE_THEMES: Record<SocialImageKind, SocialImageTheme> = {
  tour_announcement: { badgeLabel: 'TOUR ANNOUNCEMENT', gradientFrom: '#4c1d95', gradientTo: '#db2777', accent: '#fbbf24' },
  onsale:             { badgeLabel: 'ON SALE NOW',       gradientFrom: '#b91c1c', gradientTo: '#f97316', accent: '#fef08a' },
  presale:            { badgeLabel: 'PRESALE ACCESS',    gradientFrom: '#0e7490', gradientTo: '#4338ca', accent: '#5eead4' },
  city_event:         { badgeLabel: 'LIVE IN THE UK',    gradientFrom: '#be123c', gradientTo: '#1e1b4b', accent: '#fca5a5' },
  tonight:            { badgeLabel: 'TONIGHT',           gradientFrom: '#18181b', gradientTo: '#dc2626', accent: '#facc15' },
}

// A news story's existing editorial classification maps onto one of the
// five visual kinds — reusing newsPublishing.ts's own NewsStoryType
// rather than inventing a second taxonomy. "New dates" is announcement-
// shaped (an artist/venue just confirmed something), so it shares the
// tour-announcement template; venue news and general entertainment have
// no sharper fit than the generic city-wide template.
export function resolveSocialImageKindFromStoryType(storyType: NewsStoryType): SocialImageKind {
  switch (storyType) {
    case 'presale':             return 'presale'
    case 'tour_announcement':   return 'tour_announcement'
    case 'new_dates':           return 'tour_announcement'
    case 'venue_news':          return 'city_event'
    case 'general_entertainment': return 'city_event'
    default:                    return 'city_event'
  }
}

// An event-sourced pack has no story_type, so its kind is derived from
// the event's own live status instead. Deliberately neutral for
// cancelled/postponed/sold_out — this never claims tickets are "on sale"
// for a show that isn't, matching ticketLinkPolicy.ts's own wording
// rules elsewhere on the site.
export function resolveSocialImageKindFromEventStatus(status: EventStatus): SocialImageKind {
  switch (status) {
    case 'on_sale':   return 'onsale'
    case 'upcoming':  return 'tour_announcement'
    case 'sold_out':  return 'city_event'
    case 'cancelled': return 'city_event'
    case 'postponed': return 'city_event'
    default:          return 'city_event'
  }
}

// ── Approved image sources ─────────────────────────────────────────────────
// The branded graphic may use an event's or artist's own photo as a
// background — but ONLY when it came through TheShowFinder's existing,
// licensed Ticketmaster/Live Nation/Universe ingestion pipeline. This is
// deliberately the exact same host allow-list next.config.js already
// grants to next/image site-wide — kept in sync with that file rather
// than inventing a second, looser one. Anything else (a manually pasted
// URL, a scraped press photo, any other host) is rejected and the caller
// falls back to the vibrant gradient-only design. This is what makes
// "never use a copyrighted press image without an approved source"
// structural rather than just a policy note.
const APPROVED_IMAGE_HOSTS = [
  's1.ticketm.net',
  'resizing.ticketmaster.com',
  'media.ticketmaster.com',
  '**.ticketmaster.com',
  '**.livenation.com',
  'images.universe.com',
]

function hostMatchesPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('**.')) {
    const apex = pattern.slice(3)
    return hostname === apex || hostname.endsWith('.' + apex)
  }
  return hostname === pattern
}

export function isApprovedImageSource(url: string | null | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  return APPROVED_IMAGE_HOSTS.some(pattern => hostMatchesPattern(parsed.hostname, pattern))
}

// Loosely-typed read of a stored image_params.imageUrl (jsonb has no
// schema at the DB level) that applies the same approved-source gate —
// used when re-reading a previously-saved pack, so a row written before
// this gate existed (or corrupted in some other way) can never paint an
// unapproved image just because it's already sitting in the database.
export function resolveApprovedImageUrl(stored: unknown): string | null {
  return typeof stored === 'string' && isApprovedImageSource(stored) ? stored : null
}

// ── Branded image parameters ─────────────────────────────────────────────
// What the on-demand graphic (/admin/social/[id]/image, built with
// next/og's ImageResponse) needs to render — a recipe, not a stored file.
// Never pulls a real photo from a third party; the only photo it can ever
// use is one that already passed isApprovedImageSource above.

export interface SocialImageParams {
  headline:  string
  city:      string | null
  dateLabel: string | null
  kind:      SocialImageKind
  imageUrl:  string | null
}

export function buildSocialImageParams(
  headline: string,
  city: string | null,
  dateLabel: string | null,
  kind: SocialImageKind,
  imageUrl: string | null,
): SocialImageParams {
  return { headline, city, dateLabel, kind, imageUrl: isApprovedImageSource(imageUrl) ? imageUrl : null }
}

// ── Context strings ───────────────────────────────────────────────────────
// "The city name and article/event context" requirement — a short,
// human-readable line of what this pack is actually about, resolved the
// same way for every caller rather than inline in the admin action.

export function resolveNewsCandidateContext(candidate: { summary: string | null; headline: string }): string {
  const summary = candidate.summary?.trim()
  return summary || candidate.headline
}

export function buildEventContext(event: { title: string; venueName: string; startDateLabel: string }): string {
  return `${event.title} — ${event.venueName}, ${event.startDateLabel}`
}

// ── Full draft ───────────────────────────────────────────────────────────

export interface SocialPackDraftInput {
  sourceType:       SocialPackSourceType
  sourceId:         string
  cityName:         string | null
  headline:         string
  context:          string
  destinationPath:  string
  hashtagSeed:      string[]
  kind:             SocialImageKind
  imageUrl?:        string | null
  imageDateLabel?:  string | null
}

export interface SocialPackDraft {
  source_type:     SocialPackSourceType
  source_id:       string
  city_name:       string | null
  headline:        string
  context:         string
  facebook_text:   string
  instagram_text:  string
  tiktok_text:     string
  hashtags:        string[]
  destination_url: string
  utm_campaign:    string
  facebook_link:   string
  instagram_link:  string
  tiktok_link:     string
  image_params:    SocialImageParams
  status:          'draft'
}

// The one entry point an admin action calls to build the social_packs
// insert payload. Status is always 'draft' here — there is no code path
// in this function, or anywhere else in this file, that can produce
// 'ready_for_review', 'approved', or 'posted'; those only ever come from
// an explicit admin action calling advanceSocialPackStatus (below) on an
// existing row.
export function buildSocialPackDraft(input: SocialPackDraftInput): SocialPackDraft {
  const links = buildSocialPackLinks(input.destinationPath, input.sourceType, input.sourceId)
  const hashtags = buildSocialPackHashtags(input.hashtagSeed)

  return {
    source_type: input.sourceType,
    source_id: input.sourceId,
    city_name: input.cityName,
    headline: input.headline,
    context: input.context,
    facebook_text: buildFacebookCaption(input.headline, input.context, links.facebookLink),
    instagram_text: buildInstagramCaption(input.headline, input.context),
    tiktok_text: buildTikTokCaption(input.headline, input.context),
    hashtags,
    destination_url: links.destinationUrl,
    utm_campaign: links.utmCampaign,
    facebook_link: links.facebookLink,
    instagram_link: links.instagramLink,
    tiktok_link: links.tiktokLink,
    image_params: buildSocialImageParams(input.headline, input.cityName, input.imageDateLabel ?? null, input.kind, input.imageUrl ?? null),
    status: 'draft',
  }
}

// ── Status transitions ────────────────────────────────────────────────────
// Draft → Ready for review → Approved → Posted, strictly one step forward
// at a time (an admin must look at a pack at every stage, never skip
// straight from Draft to Approved) — but freely reversible backward, for
// correcting a mistake without needing to delete and recreate the row.
// 'posted' is reached only by an admin confirming, by hand, that they
// posted it themselves on the real platform — nothing here ever reaches
// out to Facebook/Instagram/TikTok to check or set that.

const STATUS_ORDER: SocialPackStatus[] = ['draft', 'ready_for_review', 'approved', 'posted']

export function canAdvanceSocialPackStatus(from: SocialPackStatus, to: SocialPackStatus): boolean {
  const fromIdx = STATUS_ORDER.indexOf(from)
  const toIdx = STATUS_ORDER.indexOf(to)
  if (toIdx < fromIdx) return true
  return toIdx === fromIdx + 1
}

// ── Eligibility ────────────────────────────────────────────────────────────
// A published news candidate is eligible for an automatically-prepared
// (still Draft, still manual-review) Social Pack only when it actually
// targets at least one city — built generically rather than hardcoded to
// "Manchester" specifically, so the same hook works for any city's pilot
// later, but only ever exercised against Manchester data in this phase.
// A national-only story (no city target at all) has no single city
// context for "the city name and article/event context" requirement, so
// it's left out rather than guessing one.
export function isEligibleForAutoSocialPack(cityNames: string[]): boolean {
  return cityNames.length > 0
}
