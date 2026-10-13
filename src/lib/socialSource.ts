// Which social platform (if any) sent this visitor? Read from the UTM
// parameters on our own bio/caption links, e.g.
//   /on-sale-this-week?utm_source=tiktok&utm_medium=social&utm_campaign=bio
// Pure and import-free so it can be tested with plain `node --test`.

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x'

export const SOCIAL_PLATFORM_NAMES: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
}

const ALIASES: Record<string, SocialPlatform> = {
  tiktok: 'tiktok', tt: 'tiktok',
  instagram: 'instagram', ig: 'instagram',
  youtube: 'youtube', yt: 'youtube', youtubeshorts: 'youtube', shorts: 'youtube',
  facebook: 'facebook', fb: 'facebook',
  x: 'x', twitter: 'x',
}

type ParamReader = { get(name: string): string | null }

// Returns the platform, or null for anyone who didn't arrive from a social
// link. Share links from the site itself (utm_source=share) are not social
// campaign traffic, so they never match.
export function socialSource(params: ParamReader | null | undefined): SocialPlatform | null {
  if (!params) return null
  const raw = params.get('utm_source')
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase().replace(/[^a-z]/g, '')
  return ALIASES[key] ?? null
}

// Value stored on the subscriber row (resolveSignupSource keeps [a-z0-9:_-]).
export function socialSignupSource(platform: SocialPlatform): string {
  return `social-${platform}`
}
