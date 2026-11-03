// Advertiser outreach emails (admin → Advertisers → Outreach). Short, local, honest: what the site is, where they
// would appear, the founding offer, and how to stop hearing from us. No visitor or click numbers, ever.

const SITE = 'https://www.theshowfinder.com'
export const OUTREACH_FROM = 'TheShowFinder <partners@theshowfinder.com>'
export const OUTREACH_REPLY_TO = 'hello@theshowfinder.com'
export const DAILY_LIMIT = 45
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

/** What people come to this kind of business for, in "…where to <eat before the show>". */
function visitPhrase(category: string): string {
  const c = category.toLowerCase()
  if (/hotel|stay|b&b|inn/.test(c)) return 'stay the night'
  if (/bar|pub|club|cocktail/.test(c)) return 'grab a drink before the show'
  if (/restaurant|cafe|café|kitchen|food|grill/.test(c)) return 'eat before the show'
  return 'eat, drink or stay'
}

/**
 * One warm, local template for everyone, filled in from the business's own details (name, city, type). Praise stays
 * general so it is true for every business it goes to; no invented facts, no numbers, no guarantees.
 */
export function buildOutreachEmail(p: Prospect, kind: 'first' | 'follow_up'): { subject: string; text: string; html: string } {
  const hi = p.contact_name?.trim() ? `Hi ${p.contact_name.trim().split(/\s+/)[0]},` : `Hi there,`
  const b = p.business_name
  const firstSubject = `We'd love to feature ${b} on TheShowFinder ${p.city}`
  const subject = kind === 'follow_up' ? `Re: ${firstSubject}` : firstSubject
  const button = `See ${b} on our ${p.city} page`
  const lines = kind === 'first'
    ? [
        hi,
        '',
        `Places like ${b} are what make a night out in ${p.city}, and that's exactly who we want to work with.`,
        '',
        `TheShowFinder helps people find every concert, show, comedy night and match in ${p.city}, and plan the night around it. We're all about local businesses, so we feature a handful of local places right next to the tickets, at the moment people decide where to ${visitPhrase(p.category)}.`,
        '',
        'Your listing can include an offer of your choice (say, 10% off with a show ticket) that they claim on their phone and use at your door.',
        '',
        `We only take nine businesses in ${p.city}, and we'd genuinely love ${b} to be one of them. Introductory rates start at £29.95 a month.`,
        '',
        `${button}: ${offerUrl(p)}`,
        '',
        'Chris',
        'TheShowFinder',
      ]
    : [
        hi,
        '',
        `Just checking this reached you. We'd still love to have ${b} on our ${p.city} page. There are only nine places, and here's how yours would look:`,
        '',
        `${button}: ${offerUrl(p)}`,
        '',
        'Chris',
        'TheShowFinder',
      ]
  const footer = `Not for you? Unsubscribe: ${unsubscribeUrl(p)}`
  const text = [...lines, '', footer].join('\n')
  const linkHtml = `<a href="${offerUrl(p)}" style="display:inline-block;background:#E8003D;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">${esc(button)} &rarr;</a>`
  const html = [
    ...lines.map(l => {
      if (!l) return ''
      if (l.includes(offerUrl(p))) return `<p style="margin:4px 0 16px">${linkHtml}</p>`
      return `<p style="margin:0 0 10px">${esc(l)}</p>`
    }),
    `<p style="margin:24px 0 0;font-size:12px;color:#888">Not for you? <a href="${unsubscribeUrl(p)}" style="color:#888">Unsubscribe</a></p>`,
  ].join('')
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1A1A2E;max-width:560px">${html}</div>` }
}
