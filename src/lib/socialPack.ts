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

// A slug-ish form (lowercase, non-alphanumeric runs collapsed to a single
// hyphen, no leading/trailing hyphen) for embedding free text like a city
// name into a utm_campaign value — self-contained rather than importing
// cityNews.ts's own citySlug(), which pulls in an rss-parser dependency
// that doesn't resolve under plain `node --test` (see newsPublishing.ts's
// own comment on NATIONAL_SLUG for the same reasoning).
function slugifyForCampaign(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function buildSocialPackLinks(
  destinationPath: string,
  sourceType: SocialPackSourceType,
  sourceId: string,
  // Distinguishes separate per-city campaigns for the same source (e.g.
  // one news story generating a Manchester post and a Leeds post) so
  // GA4 can tell them apart, not just by destination URL. Omitted
  // entirely keeps the exact original campaign format — existing
  // event-sourced packs and any pack already in the database are
  // unaffected.
  campaignSuffix?: string,
): SocialPackLinks {
  const destinationUrl = destinationPath.startsWith('http') ? destinationPath : `${SITE_ORIGIN}${destinationPath}`
  const utmCampaign = campaignSuffix
    ? `social-${sourceType}-${sourceId}-${slugifyForCampaign(campaignSuffix)}`
    : `social-${sourceType}-${sourceId}`
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
  tour_announcement: { badgeLabel: 'TOUR ANNOUNCEMENT', gradientFrom: '#7c3aed', gradientTo: '#ec4899', accent: '#fde047' },
  onsale:             { badgeLabel: 'ON SALE NOW',       gradientFrom: '#ef4444', gradientTo: '#f97316', accent: '#fef08a' },
  presale:            { badgeLabel: 'PRESALE ACCESS',    gradientFrom: '#06b6d4', gradientTo: '#4f46e5', accent: '#99f6e4' },
  city_event:         { badgeLabel: 'LIVE IN THE UK',    gradientFrom: '#071a3d', gradientTo: '#0b1024', accent: '#fbbf24' },
  tonight:            { badgeLabel: 'TONIGHT',           gradientFrom: '#7c2d12', gradientTo: '#e11d48', accent: '#fef08a' },
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
  headline:      string
  city:          string | null
  dateLabel:     string | null
  kind:          SocialImageKind
  imageUrl:      string | null
  // false means the venue/date (and therefore the destination/photo too)
  // could not be confirmed against a real event — "never invent dates,
  // venues, ticket availability" means this pack's content must say so
  // rather than pretend to be as complete as a verified one. Defaults to
  // true for a pack built before this field existed (see
  // resolveStoredVenueVerified) — only new code paths that actually know
  // they skipped verification ever set it false.
  venueVerified: boolean
}

export function buildSocialImageParams(
  headline: string,
  city: string | null,
  dateLabel: string | null,
  kind: SocialImageKind,
  imageUrl: string | null,
  venueVerified: boolean,
): SocialImageParams {
  return { headline, city, dateLabel, kind, imageUrl: isApprovedImageSource(imageUrl) ? imageUrl : null, venueVerified }
}

// Defensive read of a stored image_params.venueVerified (jsonb has no
// schema at the DB level) — a pack saved before this field existed has
// no such key at all, and that absence means "we never checked", not
// "we checked and it failed", so it defaults to true rather than
// retroactively flagging every historical pack for review.
export function resolveStoredVenueVerified(stored: unknown): boolean {
  return typeof stored === 'boolean' ? stored : true
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
  // See SocialImageParams.venueVerified. Defaults to true — only a
  // caller that actually attempted (and failed) a venue/date lookup
  // passes false.
  venueVerified?:   boolean
  // See buildSocialPackLinks's own comment — distinguishes per-city
  // campaigns for the same source.
  campaignSuffix?:  string
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
  const links = buildSocialPackLinks(input.destinationPath, input.sourceType, input.sourceId, input.campaignSuffix)
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
    image_params: buildSocialImageParams(
      input.headline, input.cityName, input.imageDateLabel ?? null, input.kind, input.imageUrl ?? null,
      input.venueVerified ?? true,
    ),
    status: 'draft',
  }
}

// ── City posts ────────────────────────────────────────────────────────────
// "Create city posts" (3 Oct 2026) — one Social Pack per city a
// published, city-targeted news story actually reaches, instead of the
// single first-city pack the original auto-create produced. The one
// genuinely new decision this adds, factored out so it's directly
// testable: what a city's pack looks like when a real event (venue +
// date) for this artist in this city was found, versus when it wasn't —
// "never invent dates, venues, ticket availability" means the unverified
// case must read as unverified, not as a slightly-less-detailed version
// of the verified one.

// A real, looked-up event — never fabricated. eventSlug/venueName/
// dateLabel all come from an actual events/venues row.
export interface CityPostVerifiedMatch {
  eventSlug: string
  venueName: string
  dateLabel: string
  imageUrl:  string | null
}

export interface CityPostDraftInput {
  candidateId:     string
  headline:        string
  // resolveNewsCandidateContext(candidate)'s result — used verbatim when
  // no verified match exists, so an unverified city pack still reads as
  // a real sentence, never a half-filled template.
  fallbackContext: string
  cityName:        string
  kind:            SocialImageKind
  // null when no artist name was on the story, the city has no matching
  // event, or the lookup itself failed — every one of those is treated
  // identically as "not verified", never guessed at.
  verified:        CityPostVerifiedMatch | null
}

export function buildCityPostDraft(input: CityPostDraftInput): SocialPackDraft {
  const { verified } = input

  const context = verified
    ? buildEventContext({ title: input.headline, venueName: verified.venueName, startDateLabel: verified.dateLabel })
    : input.fallbackContext

  // A verified match points the tracked link at the specific event page
  // (the most relevant, most useful destination); otherwise it falls
  // back to the city page — TheShowFinder's own property either way,
  // never the source article.
  const destinationPath = verified
    ? `/events/${verified.eventSlug}`
    : `/cities/${encodeURIComponent(input.cityName)}`

  return buildSocialPackDraft({
    sourceType: 'news_candidate',
    sourceId: input.candidateId,
    cityName: input.cityName,
    headline: input.headline,
    context,
    destinationPath,
    // Per-city hashtags, not every target city on the story — a Leeds
    // post should never carry #Manchester just because the same news
    // story also targets Manchester.
    hashtagSeed: [input.cityName, input.headline],
    kind: input.kind,
    imageUrl: verified?.imageUrl ?? null,
    imageDateLabel: verified?.dateLabel ?? null,
    venueVerified: verified !== null,
    campaignSuffix: input.cityName,
  })
}

// ── Status transitions ────────────────────────────────────────────────────
// Draft → Ready for review → Approved → Posted, strictly one step forward
// at a time (an admin must look at a pack at every stage, never skip
// straight from Draft to Approved) — but freely reversible backward, for
// correcting a mistake without needing to delete and recreate the row.
// 'posted' is reached only by an admin confirming, by hand, that they
// posted it themselves on the real platform — nothing here ever reaches
// out to Facebook/Instagram/TikTok to check or set that.

// Deliberately only the four linear statuses — 'skipped' is handled by
// its own dedicated canSkipSocialPack/canUnskipSocialPack below, not
// folded into this one-step-forward/any-step-back ladder. Calling this
// with 'skipped' as either argument always returns false, explicitly
// guarded below rather than left to indexOf's incidental -1 behaviour
// (an unguarded `-1 < fromIdx` is true for every real fromIdx, which
// would wrongly treat 'skipped' as reachable "backward" from anywhere):
// skipping/unskipping is a separate action, never a move "along" this
// status line.
const STATUS_ORDER: SocialPackStatus[] = ['draft', 'ready_for_review', 'approved', 'posted']

export function canAdvanceSocialPackStatus(from: SocialPackStatus, to: SocialPackStatus): boolean {
  const fromIdx = STATUS_ORDER.indexOf(from)
  const toIdx = STATUS_ORDER.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return false
  if (toIdx < fromIdx) return true
  return toIdx === fromIdx + 1
}

// A pack can be skipped any time before it's actually been posted — a
// city whose venue/date couldn't be verified, or one an admin simply
// decides not to run, without deleting the row (it stays editable and
// visible, same as any other pack). Already-skipped is excluded too —
// skip the skip button, use Unskip instead.
export function canSkipSocialPack(status: SocialPackStatus): boolean {
  return status === 'draft' || status === 'ready_for_review' || status === 'approved'
}

// The only way back from 'skipped' — always to 'draft' (a full re-review
// from the top), never straight back into 'ready_for_review' or
// 'approved', since skipping it means that earlier review no longer
// stands.
export function canUnskipSocialPack(status: SocialPackStatus): boolean {
  return status === 'skipped'
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
