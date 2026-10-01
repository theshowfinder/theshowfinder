// Pure, dependency-free helpers for the welcome email's plain-text body
// (sent alongside the HTML version as the `text:` fallback — see
// sendWelcomeEmail in src/app/actions/newsletter.tsx) and a small
// validator built specifically to catch the bug reported here: an email
// address or URL inserted into a template was immediately followed, with
// no whitespace, by the next word — e.g. "chris@hotmail.com" directly
// followed by "because" rendering (in the mail client that auto-detects
// links) as one link to "chris@hotmail.combecause".
//
// No '@/' imports and no npm packages — matching subscribers.ts/
// analytics.ts/newsletterContent.ts, so this stays resolvable by Node's
// plain `node --test` runner.

// True when every occurrence of `token` (e.g. an email address or a URL
// that's been inserted into a larger block of text) is followed only by
// whitespace or the end of the string — never directly by another
// letter, digit, or '.' with nothing separating them. Checks a known,
// exact token rather than pattern-matching "what looks like an email or
// URL" in free text: a regex guessing at where a domain/TLD ends and the
// next word begins has exactly the same ambiguity that causes mail
// clients' own auto-linkifiers to get this wrong in the first place
// (nothing can tell ".com" from ".combecause" by shape alone) — but here
// the token is already known, so there's nothing to guess.
export function isTokenCleanlyTerminated(text: string, token: string): boolean {
  let index = text.indexOf(token)
  let found = false
  while (index !== -1) {
    found = true
    const nextChar = text[index + token.length]
    if (nextChar !== undefined && /[\w.]/.test(nextChar)) return false
    index = text.indexOf(token, index + token.length)
  }
  return found
}

// The welcome email's plain-text body. Deliberately puts the
// subscriber's address on its own line with nothing else on it, rather
// than mid-sentence immediately followed by more prose (and a trailing
// period) — the structure the original template had, and the one that's
// easiest for an auto-linkifier to misread.
export function buildWelcomeEmailText(email: string): string {
  return [
    'Welcome to TheShowFinder!',
    '',
    "You're on the list! You'll now receive alerts when tickets go on sale for",
    'concerts, theatre, comedy, sports, and family shows across the UK.',
    '',
    'WHAT YOU\'LL GET',
    '- On-sale alerts — know the moment tickets are released',
    '- Weekly digests — the best upcoming shows near you',
    '- Venue & artist picks — curated events across 36 UK cities',
    '',
    'Browse events: https://www.theshowfinder.com',
    '',
    '---',
    'You signed up at theshowfinder.com with this address:',
    email,
    '',
    `Unsubscribe: https://www.theshowfinder.com/unsubscribe?email=${encodeURIComponent(email)}`,
    '© 2026 TheShowFinder',
  ].join('\n')
}
