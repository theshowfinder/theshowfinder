// Backlink outreach: short, personal emails to venues (we list their shows), organisers (free listings and tickets)
// and local press (data for a story). Each offers something useful that naturally comes with a link back to us: the
// free "what's on" widget (an iframe plus a plain text link), a "Buy tickets" button, or a source credit.
// Nothing is sent until Chris approves it in /admin/backlinks. Pure module (no '@/' imports) for node --test.

export const SITE = 'https://www.theshowfinder.com'
// Daily sending grows as the mail reputation builds: 30 on the first weekday of sending, +10 each weekday after, up to
// 150 (Resend) plus up to 20 from Chris's Zoho mailbox. Bounces and spam complaints still stop it (the outreach brake).
export const LINK_START_PER_DAY = 30
export const LINK_STEP_PER_DAY = 10
export const LINK_MAX_PER_DAY = 150
export const LINK_ZOHO_PER_DAY = 20
export const LINK_DAILY_LIMIT = LINK_MAX_PER_DAY + LINK_ZOHO_PER_DAY

/** Today's Resend limit: weekdays since the first email was sent, ramping up to the maximum. */
export function linkResendLimit(firstSentIso: string | null, now: Date = new Date()): number {
  if (!firstSentIso) return LINK_START_PER_DAY
  let weekdays = 0
  for (let d = new Date(firstSentIso); d < now; d = new Date(d.getTime() + 86_400_000)) if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) weekdays++
  return Math.min(LINK_MAX_PER_DAY, LINK_START_PER_DAY + LINK_STEP_PER_DAY * Math.max(0, weekdays - 1))
}
export const LINK_FOLLOW_UP_DAYS = 7
export const LINK_FROM = 'Chris at TheShowFinder <partners@theshowfinder.com>'
export const LINK_REPLY_TO = 'hello@theshowfinder.com'

export type LinkKind = 'venue' | 'organiser' | 'press'
export interface LinkProspect {
  id: string; kind: LinkKind; name: string; city: string | null; website: string | null; email: string | null
  contact_name: string | null; shows: number | null; page_url: string | null; pitch: string
  subject?: string | null; body?: string | null; unsubscribe_token: string
  venue_slug?: string | null; sample_event?: string | null
}

/** Sites that are never a venue's or organiser's own website. */
const NOT_OWN_SITE = /(^|\.)(ticketmaster|seetickets|eventbrite|skiddle|dice\.fm|ents24|songkick|bandsintown|axs|eventim|gigantic|ticketweb|wegottickets|trybooking|ticketsource|ticketline|facebook|instagram|twitter|x\.com|tiktok|youtube|linktr\.ee|linkin\.bio|wikipedia|google|tripadvisor|yelp|theshowfinder|bit\.ly)\b/i

export function domainOf(url: string | null | undefined): string | null {
  try { return new URL(/^https?:\/\//i.test(String(url)) ? String(url) : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

export function isOwnSite(url: string | null | undefined): boolean {
  const d = domainOf(url)
  return !!d && d.includes('.') && !NOT_OWN_SITE.test(d)
}

/** Does this page link to us? (An href to theshowfinder.com, not just a mention.) */
export function linksToUs(html: string): string | null {
  const m = /href\s*=\s*["'](https?:\/\/(?:www\.)?theshowfinder\.com[^"']*)["']/i.exec(html)
  return m ? m[1] : null
}

/** Pages on a site worth checking for a link: what's on, events, links, partners, tickets, about. */
export function pagesToCheck(html: string, base: string, max = 5): string[] {
  const out = new Set<string>()
  const re = /href\s*=\s*["']([^"'#]+)["']/gi
  let m: RegExpExecArray | null
  const host = domainOf(base)
  while ((m = re.exec(html)) && out.size < max) {
    if (!/what-?s-?on|events?|gigs?|listings?|links?|partners?|tickets?|about|visit/i.test(m[1])) continue
    try { const u = new URL(m[1], base); if (domainOf(u.href) === host) out.add(u.href.split('#')[0]) } catch { /* bad link */ }
  }
  return [...out]
}

export function widgetSnippet(venueSlug: string): string {
  const slug = encodeURIComponent(venueSlug)
  return [
    `<iframe src="${SITE}/embed/venue/${slug}" width="100%" height="460" style="max-width:420px;border:1px solid #e2e8f0;border-radius:12px" loading="lazy" title="Upcoming shows on TheShowFinder"></iframe>`,
    `<p><a href="${SITE}/venues/${slug}">Find tickets on TheShowFinder</a></p>`,
  ].join('\n')
}

const hello = (p: LinkProspect) => `Hi ${p.contact_name?.split(' ')[0] || 'there'},`
const signOff = (p: LinkProspect) => ['', 'Chris', 'TheShowFinder', SITE, '', '—', `Don't want emails from us? ${SITE}/unsubscribe/${p.unsubscribe_token}`]

/** The draft email (subject and plain text). Press emails use the subject and body written for them. */
export function buildLinkEmail(p: LinkProspect, step: 'first' | 'follow_up'): { subject: string; text: string } {
  if (step === 'follow_up') {
    return {
      subject: `Re: ${(p.subject || buildLinkEmail(p, 'first').subject).replace(/^Re:\s*/i, '')}`,
      text: [hello(p), '', p.kind === 'press'
        ? 'Just checking this reached you. Happy to send the full list or different figures if that suits a piece better.'
        : `Just checking this reached you. ${p.kind === 'venue' ? 'The widget is free and updates itself, so there is nothing to maintain.' : 'Listing is free and takes two minutes.'} If it isn't for you, no problem, I won't email again.`,
      ...signOff(p)].join('\n'),
    }
  }
  if (p.kind === 'press') return { subject: p.subject || `${p.city ?? 'Local'} shows: figures for a what's on piece`, text: [p.body ?? '', ...signOff(p)].join('\n') }

  if (p.kind === 'venue') {
    const shows = p.shows && p.shows > 1 ? `${p.shows} upcoming shows` : 'your upcoming shows'
    const lines = [
      hello(p), '',
      `I'm Chris from TheShowFinder, a UK site where people find what's on near them and compare tickets. We list ${shows} at ${p.name}, with dates, times and where to buy: ${p.page_url ?? SITE}`,
      '',
      'Two free things that might be useful to you:',
      '',
      `1. A "what's on" widget for your website. It lists your upcoming shows and updates itself every day. Paste this where you want it:`,
      '',
      p.venue_slug ? widgetSnippet(p.venue_slug) : `${SITE}/widgets`,
      '',
      `2. Your own events (quiz nights, comedy, club nights, anything not on Ticketmaster) can go on the site free. You can also sell tickets through us: you keep 100% of your ticket price, or give free tickets with QR check-in at the door. ${SITE}/sell-tickets`,
      '',
      `If neither suits, a link to your page from your "what's on" or visitor information page also helps people find your shows.`,
      '',
      'Any questions, just reply.',
    ]
    return { subject: `${p.name}: your ${p.shows && p.shows > 1 ? `${p.shows} upcoming shows` : 'shows'} on TheShowFinder`, text: [...lines, ...signOff(p)].join('\n') }
  }

  // Organiser
  const lines = [
    hello(p), '',
    `I'm Chris from TheShowFinder, a UK site where people find what's on near them${p.city ? ` (including our ${p.city} page: ${SITE}/cities/${encodeURIComponent(p.city)})` : ''}.${p.sample_event ? ` I came across ${p.sample_event} and thought your events would fit well.` : ''}`,
    '',
    'You can list your events on TheShowFinder free, and they show on the local city page, the venue page and in search. Two minutes per event.',
    '',
    `If you sell tickets, you can sell them through us too: you keep 100% of your ticket price (buyers pay a small booking fee), you're paid as you sell, and you get QR tickets, a door scanner on your phone and a "Buy tickets" button for your own website. Free events cost nothing. ${SITE}/sell-tickets`,
    '',
    `List an event: ${SITE}/list-your-event`,
    '',
    'Any questions, just reply.',
  ]
  return { subject: `Free listings for ${p.name}'s events${p.city ? ` in ${p.city}` : ''}`, text: [...lines, ...signOff(p)].join('\n') }
}

/** UK weekday office hours, when outreach goes out. */
export function inSendingHours(now: Date = new Date()): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]))
  const h = Number(p.hour)
  return !['Sat', 'Sun'].includes(p.weekday) && h >= 9 && h < 17
}
