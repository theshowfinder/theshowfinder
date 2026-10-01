// Phase 5A: email audience foundation — pure, dependency-free validation
// logic for newsletter signups (src/app/actions/newsletter.tsx), kept free
// of Next.js/Supabase machinery so it can be unit-tested with Node's
// built-in test runner (see subscribers.test.ts), matching the pattern
// already used for newsFiltering.ts/newsPublishing.ts.

// Trim + lowercase — the same normalization already applied inline before
// this phase; pulled out so validation and normalization are one call each,
// not duplicated between the signup action and anywhere else that needs to
// compare/store an email the same way (e.g. the unsubscribe page).
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// A tighter check than the previous bare `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` --
// local part uses the WHATWG HTML5 "type=email" character class; the
// domain requires one or more valid DNS labels followed by a final,
// letters-only top-level label of at least 2 characters (real TLDs are
// always 2+ letters -- this also rejects a bare single-label "domain" with
// no dot at all, and a 1-character TLD like "theshowfinder.c"). Plus two
// extra rejections the pattern alone wouldn't catch: a run of two dots
// anywhere, and a leading dot in the local part -- both are always invalid
// and both were previously accepted (e.g. "a..b@x.com" or ".a@x.com"
// passed the old regex). Expects an already-normalized (trimmed/
// lowercased) email -- call normalizeEmail first, matching how the signup
// action already did this inline before this phase.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

// RFC 5321's own limit on a complete address — rejecting anything longer
// is a defensive cap, not a real-world concern, but it keeps a pathological
// input from ever reaching the database or an outbound email API call.
const MAX_EMAIL_LENGTH = 254

export function isValidEmail(email: string): boolean {
  if (!email || email.length > MAX_EMAIL_LENGTH) return false
  if (email.includes('..')) return false
  if (email.startsWith('.')) return false
  return EMAIL_RE.test(email)
}
