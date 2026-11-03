// Advertiser outreach emails (admin → Advertisers → Outreach). Short, local, honest: what the site is, where they
// would appear, the founding offer, and how to stop hearing from us. No visitor or click numbers, ever.

const SITE = 'https://www.theshowfinder.com'
export const OUTREACH_FROM = 'TheShowFinder <partners@theshowfinder.com>'
export const OUTREACH_REPLY_TO = 'hello@theshowfinder.com'
export const DAILY_LIMIT = 20
export const FOLLOW_UP_AFTER_DAYS = 7
/** Statuses the sender may email. company_type must also allow it (see canEmail). */
export const SENDABLE_COMPANY_TYPES = ['ltd', 'consented'] as const

export interface Prospect {
  id: string
  business_name: string
  category: string
  city: string
  near_venue: string | null
  distance_label: string | null
  email: string
  company_type: string
  status: string
  ref_code: string
  unsubscribe_token: string
}

/** UK PECR: only limited companies / LLPs (or businesses that said yes) get unsolicited email. */
export function canEmail(p: Pick<Prospect, 'company_type' | 'status'>): boolean {
  return (SENDABLE_COMPANY_TYPES as readonly string[]).includes(p.company_type) && !['unsubscribed', 'bounced', 'not_interested', 'signed_up'].includes(p.status)
}

export const offerUrl = (p: Pick<Prospect, 'ref_code'>) => `${SITE}/p/${p.ref_code}`
export const unsubscribeUrl = (p: Pick<Prospect, 'unsubscribe_token'>) => `${SITE}/unsubscribe/${p.unsubscribe_token}`

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export function buildOutreachEmail(p: Prospect, kind: 'first' | 'follow_up'): { subject: string; text: string; html: string } {
  const venue = p.near_venue?.trim() || null
  const where = venue ? `people going to shows at ${venue}` : `people going to shows in ${p.city}`
  const near = p.distance_label?.trim() || (venue ? `near ${venue}` : `in ${p.city}`)
  const subject = kind === 'first'
    ? (venue ? `${p.business_name} and show nights at ${venue}` : `${p.business_name} and show nights in ${p.city}`)
    : `Re: ${venue ? `${p.business_name} and show nights at ${venue}` : `${p.business_name} and show nights in ${p.city}`}`
  const lines = kind === 'first'
    ? [
        `Hi ${p.business_name} team,`,
        '',
        `TheShowFinder is a UK site where ${where} find their tickets and plan the night around the show.`,
        '',
        `We'd like to feature ${p.business_name} to them: right under the ticket buttons on show pages for venues ${near}, and in the ${p.city} guide on our site, with an offer they can claim on their phone and use at your door (for example "10% off food with your show ticket").`,
        '',
        `As one of our founding partners in ${p.city}, your first month is free, then £44.95 a month. Cancel any time.`,
        '',
        `See how it works and set it up in a few minutes: ${offerUrl(p)}`,
        '',
        'Or just reply to this email with any questions.',
        '',
        'Thanks,',
        'TheShowFinder',
      ]
    : [
        `Hi ${p.business_name} team,`,
        '',
        `A quick follow-up in case my last email got buried. We're featuring a small number of places ${near} to ${where}, and the founding offer (first month free) is still open for ${p.business_name}.`,
        '',
        `Details and sign-up: ${offerUrl(p)}`,
        '',
        'If it is not for you, no problem: I won\'t follow up again.',
        '',
        'Thanks,',
        'TheShowFinder',
      ]
  const footer = `You're receiving this because ${p.business_name} is a business ${near}. To stop hearing from us: ${unsubscribeUrl(p)}`
  const text = [...lines, '', '--', footer].join('\n')
  const link = (u: string, label: string) => `<a href="${u}" style="color:#E8003D;font-weight:bold">${esc(label)}</a>`
  const html = [
    ...lines.map(l => {
      if (!l) return ''
      if (l.includes(offerUrl(p))) return `<p style="margin:0 0 10px">${esc(l.replace(offerUrl(p), '')).trim()} ${link(offerUrl(p), 'See how it works')}</p>`
      return `<p style="margin:0 0 10px">${esc(l)}</p>`
    }),
    `<p style="margin:24px 0 0;font-size:12px;color:#777">You're receiving this because ${esc(p.business_name)} is a business ${esc(near)}. <a href="${unsubscribeUrl(p)}" style="color:#777">Unsubscribe</a></p>`,
  ].join('')
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1A1A2E;max-width:560px">${html}</div>` }
}
