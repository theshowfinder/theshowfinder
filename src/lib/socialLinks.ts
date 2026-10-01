// Phase 5B: TheShowFinder's social media accounts, as a single pure
// source of truth — src/components/Footer.tsx (the shared, site-wide
// footer rendered once in src/app/layout.tsx) renders this list, rather
// than hard-coding the platform/label/href combinations inline, so the
// data itself can be unit-tested with plain `node --test` even though
// this codebase has no component-level test harness (no jest/
// @testing-library/react/vitest/playwright — Footer.tsx and every other
// component are untested JSX, consistent with the rest of this
// codebase). No '@/' imports and no npm packages, matching
// subscribers.ts/analytics.ts/emailText.ts.
//
// Deliberately just a links list — no embedded feeds, follower counts,
// or third-party widgets, per "keep the site fast."

export interface SocialLink {
  platform: 'Instagram' | 'TikTok' | 'Facebook'
  label: string
  href: string
}

export const SOCIAL_LINKS: SocialLink[] = [
  { platform: 'Instagram', label: 'Follow TheShowFinder on Instagram', href: 'https://www.instagram.com/theshow_finder/' },
  { platform: 'TikTok',    label: 'Follow TheShowFinder on TikTok',    href: 'https://www.tiktok.com/@theshowfinder' },
  { platform: 'Facebook',  label: 'Follow TheShowFinder on Facebook',  href: 'https://www.facebook.com/profile.php?id=61592305512592' },
]

// Every link must be a real https URL and carry a non-empty, descriptive
// label (for screen readers, via the anchor's aria-label in Footer.tsx)
// — guards against a pasted-in link silently missing its label or
// pointing at an insecure/relative URL.
export function isValidSocialLink(link: SocialLink): boolean {
  if (!link.label.trim()) return false
  try {
    const url = new URL(link.href)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}
