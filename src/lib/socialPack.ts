// Pure logic for the Social Pack (Phase 7) — manual-review preparation of
// Facebook/Instagram/TikTok drafts for an approved, published city news
// story or an admin-flagged event update. Built generically (any city),
// validated against Manchester for this pilot phase. No '@/' imports and
// no npm packages, matching on-sale.ts/newsPublishing.ts — nothing in
// this file ever makes a network call or talks to a platform API; it
// only builds the record an admin action then writes to social_packs,
// and that record's own status always starts at 'draft'.

import { buildUtmUrl } from './analytics.ts'
import type { SocialPackSourceType, SocialPackStatus } from './types/database'

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

// ── Branded image parameters ─────────────────────────────────────────────
// What the on-demand graphic (/admin/social/[id]/image, built with
// next/og's ImageResponse) needs to render — a recipe, not a stored file.
// Never pulls a real photo from a third party; this is the only "image"
// a pack ever has unless an admin later swaps in their own.

export interface SocialImageParams {
  headline: string
  city:     string | null
  dateLabel: string | null
}

export function buildSocialImageParams(headline: string, city: string | null, dateLabel: string | null): SocialImageParams {
  return { headline, city, dateLabel }
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
    image_params: buildSocialImageParams(input.headline, input.cityName, input.imageDateLabel ?? null),
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
