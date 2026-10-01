// The public site header's nav links and primary CTA, as a single pure
// source of truth — src/components/Header.tsx renders this rather than
// hard-coding hrefs inline, so it can be unit-tested with plain
// `node --test` even though this codebase has no component-level test
// harness (no jest/@testing-library/react/vitest/playwright — Header.tsx
// and every other component are untested JSX, same as socialLinks.ts's
// relationship to Footer.tsx). No '@/' imports and no npm packages.
//
// Public account registration ("Sign up free" / "Sign in", linking to
// /signup and /login) was removed from here — the visitor account system
// isn't used yet and its email-confirmation flow doesn't work end-to-end,
// so sending visitors into it from site-wide nav was a dead end. The
// /signup and /login pages and their server actions are untouched and
// still reachable directly; they just aren't linked from public nav
// anymore, for when saved events/favourites/personalised alerts revive
// the need for accounts. The admin login at /admin is separate — private,
// password-gated, unaffected by this.
//
// In its place: a single CTA for the thing that actually works today —
// the email-only newsletter (src/components/NewsletterSignup.tsx, id
// "newsletter" on the homepage). isAccountAuthHref() exists purely so the
// regression this change fixes (an account link creeping back into public
// nav) has a test that fails loudly if it ever happens again.

export interface NavLink {
  label: string
  href:  string
}

export const NAV_LINKS: NavLink[] = [
  { label: 'News',     href: '/news' },
  { label: 'On Sale',  href: '/on-sale-this-week' },
  { label: 'Concerts', href: '/events?category=concert' },
  { label: 'Theatre',  href: '/events?category=theatre' },
  { label: 'Comedy',   href: '/events?category=comedy'  },
  { label: 'Sports',   href: '/events?category=sports'  },
  { label: 'Family',   href: '/events?category=family'  },
]

// Scrolls to NewsletterSignup's section on the homepage (id="newsletter")
// — on another page, following this link navigates home first, same as
// any other cross-page anchor link.
export const PRIMARY_CTA: NavLink = { label: 'Get Ticket Alerts', href: '/#newsletter' }

const ACCOUNT_AUTH_PATHS = ['/login', '/signup']

// True for any href that points at the (now-unlinked) visitor account
// system, regardless of a leading slash, trailing slash, or query/hash
// suffix. Used in tests to assert nothing in NAV_LINKS or PRIMARY_CTA
// points there.
export function isAccountAuthHref(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return ACCOUNT_AUTH_PATHS.includes(path)
}
