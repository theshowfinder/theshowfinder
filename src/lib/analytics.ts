// Phase 5A, requirement 4: "Analytics and ticket-click measurement."
//
// Pure, dependency-free helpers for first-party campaign attribution
// (UTM parameters on links TheShowFinder controls — newsletter emails,
// the admin Share Kit's platform links) and for the GA4 custom-event
// payloads fired from click handlers elsewhere in the app.
//
// GA4 is already wired site-wide (src/app/layout.tsx's gtag script) and
// already measures page views — including homepage, /news, and city
// pages — with zero code here, along with referrer/source via its
// default channel grouping. So this file's job is narrower: (1) tag
// outbound links we generate (newsletter, social share kit) so GA4's
// automatic attribution can tell that traffic apart, and (2) build the
// event payloads for actions GA4 can't see on its own — clicks on
// outbound ticket/affiliate links and news-item links, which navigate
// away before GA4 would ever log anything about them otherwise.
//
// No '@/' imports and no npm packages — this stays resolvable by Node's
// plain `node --test` runner, matching subscribers.ts/newsletterContent.ts.

export interface UtmParams {
  source: string
  medium: string
  campaign: string
  content?: string
}

// Appends utm_* query parameters to a URL, preserving any existing query
// string. Never overwrites a utm_ key the URL already carries (so a link
// that arrives already tagged, e.g. pasted from elsewhere, isn't double
// -tagged). Returns the input unchanged if it isn't a valid absolute URL
// (e.g. a relative path, or an empty/malformed string) rather than
// throwing — callers always get back something safe to render as an href.
export function buildUtmUrl(rawUrl: string, params: UtmParams): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  const entries: Array<[string, string | undefined]> = [
    ['utm_source', params.source],
    ['utm_medium', params.medium],
    ['utm_campaign', params.campaign],
    ['utm_content', params.content],
  ]

  for (const [key, value] of entries) {
    if (!value) continue
    if (url.searchParams.has(key)) continue
    url.searchParams.set(key, value)
  }

  return url.toString()
}

// Tags a link for inclusion in a sent newsletter — source=newsletter,
// medium=email, campaign=the newsletter's own id so each send is
// distinguishable in GA4 even when the same article is linked from two
// different newsletters.
export function buildNewsletterLink(rawUrl: string, newsletterId: string): string {
  return buildUtmUrl(rawUrl, { source: 'newsletter', medium: 'email', campaign: `newsletter-${newsletterId}` })
}

// Tags a link for the admin Share Kit's platform-specific copy —
// medium is always 'social' except for the 'email' platform itself,
// which behaves like buildNewsletterLink but keyed to a news candidate
// rather than a newsletter send. `campaign` is the candidate's own id so
// every platform's copy for the same story is grouped together in GA4
// while still being attributable to the specific story.
export function buildSocialShareLink(rawUrl: string, platform: string, candidateId: string): string {
  if (platform === 'email') {
    return buildUtmUrl(rawUrl, { source: 'email', medium: 'email', campaign: `share-${candidateId}` })
  }
  return buildUtmUrl(rawUrl, { source: platform, medium: 'social', campaign: `share-${candidateId}` })
}

export type TicketClickSection =
  | 'hero_cta'
  | 'buy_direct'
  | 'primary'
  | 'more_options'
  | 'also_available'
  | 'secondary_market'

export interface TicketClickParams {
  provider: string
  section: TicketClickSection
  context: string
}

// GA4 custom-event payload for a click on an outbound ticket/affiliate
// link. `context` identifies the page the click happened on (an event
// slug, artist slug, etc.) so clicks can be grouped per listing as well
// as per provider.
export function buildTicketClickEvent(params: TicketClickParams): Record<string, string> {
  return {
    event_category: 'ticket_click',
    provider: params.provider,
    section: params.section,
    context: params.context,
  }
}

export interface NewsClickParams {
  destination: string
  context: string
}

// GA4 custom-event payload for a click on a news item (fulfils "Article
// views" — these items link straight to the external publisher, there's
// no internal article page to log a pageview for, so the click itself is
// the measurable signal).
export function buildNewsClickEvent(params: NewsClickParams): Record<string, string> {
  return {
    event_category: 'news_click',
    destination: params.destination,
    context: params.context,
  }
}
