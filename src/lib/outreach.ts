// Advertiser outreach emails (admin → Advertisers → Outreach). Short, local, honest: what the site is, where they
// would appear, the founding offer, and how to stop hearing from us. No visitor or click numbers, ever.

const SITE = 'https://www.theshowfinder.com'
export const OUTREACH_FROM = 'TheShowFinder <partners@theshowfinder.com>'
export const OUTREACH_REPLY_TO = 'hello@theshowfinder.com'
export const DAILY_LIMIT = 20
export const FOLLOW_UP_AFTER_DAYS = 4
/** No reply this long after the first email (follow-up sent in between): marked "No response", never chased again. */
export const NO_RESPONSE_AFTER_DAYS = 10
/** Statuses the sender may email. company_type must also allow it (see canEmail). */
export const SENDABLE_COMPANY_TYPES = ['ltd', 'consented'] as const

export interface Prospect {
  id: string
  business_name: string
  category: string
  city: string
  near_venue: string | null
  distance_label: string | null
  contact_name?: string | null
  email: string
  company_type: string
  status: string
  ref_code: string
  unsubscribe_token: string
}

/** UK PECR: only limited companies / LLPs (or businesses that said yes) get unsolicited email. */
export function canEmail(p: Pick<Prospect, 'company_type' | 'status'>): boolean {
  return (SENDABLE_COMPANY_TYPES as readonly string[]).includes(p.company_type) && ['approved', 'sent'].includes(p.status)
}

export const offerUrl = (p: Pick<Prospect, 'ref_code'>) => `${SITE}/p/${p.ref_code}`
export const unsubscribeUrl = (p: Pick<Prospect, 'unsubscribe_token'>) => `${SITE}/unsubscribe/${p.unsubscribe_token}`

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** What people would come to this kind of business for, in the email's one line about the audience. */
function visitWord(category: string): string {
  const c = category.toLowerCase()
  if (/hotel|stay|b&b|inn/.test(c)) return 'stay'
  if (/bar|pub|club|cocktail/.test(c)) return 'drink'
  if (/restaurant|cafe|café|kitchen|food|grill/.test(c)) return 'eat'
  return 'eat, drink or stay'
}

/**
 * One template for everyone, filled in from the business's own details (name, city, type, nearest venue). Short:
 * what we are, where they would appear, the limited places and price, one link to see themselves on the page.
 */
export function buildOutreachEmail(p: Prospect, kind: 'first' | 'follow_up'): { subject: string; text: string; html: string } {
  const hi = p.contact_name?.trim() ? `Hi ${p.contact_name.trim().split(/\s+/)[0]},` : `Hi there,`
  const venue = p.near_venue?.trim()
  const subject = `${kind === 'follow_up' ? 'Re: ' : ''}Featuring ${p.business_name} on TheShowFinder ${p.city}`
  const lines = kind === 'first'
    ? [
        hi,
        '',
        `TheShowFinder lists the concerts, shows, comedy and sport on in ${p.city}${venue ? `, including everything at ${venue}` : ''}, with tickets from the main sellers.`,
        '',
        `We feature a small number of local businesses right under the ticket buttons, at the moment people decide where to ${visitWord(p.category)} before and after the show. Your listing can include an offer they claim on their phone and use at your door.`,
        '',
        `There are only nine places in ${p.city}, three of them Featured. Introductory rates start at £29.95 a month.`,
        '',
        `See how ${p.business_name} would look and sign up in a few minutes: ${offerUrl(p)}`,
        '',
        'Chris',
        'TheShowFinder',
      ]
    : [
        hi,
        '',
        `A quick follow-up: the ${p.city} places are limited to nine, with three Featured. You can see ${p.business_name} on the page and choose a package here: ${offerUrl(p)}`,
        '',
        'Chris',
        'TheShowFinder',
      ]
  const footer = `Not for you? Unsubscribe: ${unsubscribeUrl(p)}`
  const text = [...lines, '', footer].join('\n')
  const linkHtml = `<a href="${offerUrl(p)}" style="display:inline-block;background:#E8003D;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:8px">See ${esc(p.business_name)} on the page</a>`
  const html = [
    ...lines.map(l => {
      if (!l) return ''
      if (l.includes(offerUrl(p))) return `<p style="margin:0 0 6px">${esc(l.replace(offerUrl(p), '').replace(/[:\s]+$/, ''))}:</p><p style="margin:0 0 14px">${linkHtml}</p>`
      return `<p style="margin:0 0 10px">${esc(l)}</p>`
    }),
    `<p style="margin:24px 0 0;font-size:12px;color:#888">Not for you? <a href="${unsubscribeUrl(p)}" style="color:#888">Unsubscribe</a></p>`,
  ].join('')
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1A1A2E;max-width:560px">${html}</div>` }
}
