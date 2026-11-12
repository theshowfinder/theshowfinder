// Emails to advertisers: the welcome when a listing goes live (with the staff PIN for vouchers) and a monthly report (sent only when Chris chooses).
import { resend, FROM_EMAIL } from '@/lib/resend'

const SITE = 'https://www.theshowfinder.com'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const COPY_TO = 'hello@theshowfinder.com'

export async function sendAdvertiserWelcome(a: { to: string; contactName: string; businessName: string; city: string; featured: boolean; offer: string | null; pin: string; trial?: { endsOn: string; monthlyPrice: string } | null }) {
  const cityUrl = `${SITE}/cities/${encodeURIComponent(a.city)}`
  const where = a.featured
    ? `on the ${a.city} city page and in the "Make a night of it" box on every show page in ${a.city}, right under the ticket buttons`
    : `in the local guide on the ${a.city} city page`
  const offerLines = a.offer
    ? [
        `Your offer: "${a.offer}"`,
        '',
        'How vouchers work:',
        '1. A visitor taps "Get voucher" on your listing and gets a one-off code with a QR code on their phone.',
        '2. At your till, scan the QR with any phone camera. It opens a TheShowFinder page saying whether the voucher is valid.',
        `3. Enter your staff PIN: ${a.pin}  and press "Mark as used". Then apply the offer.`,
        'Each voucher works once. Show-page vouchers are valid on the day of the show; city-page vouchers for 7 days.',
        'Keep the PIN with your staff only.',
      ]
    : ['Add an offer any time (for example "10% off food with your show ticket"): reply to this email. Listings with an offer give people a reason to choose you.']
  const text = [
    `Hi ${a.contactName},`,
    '',
    `${a.businessName} is now live on TheShowFinder, ${where}.`,
    `See it here: ${cityUrl}`,
    '',
    ...offerLines,
    '',
    'We will feature you on our social channels and check in with you each month.',
    '',
    a.trial
      ? `Your first month is free, until ${a.trial.endsOn}. After that it is your founding price of ${a.trial.monthlyPrice} a month, kept for as long as you stay, and you can cancel any time: just reply to this email. Around three weeks in we will send you what your listing has done so far.`
      : 'Your placement is a 12-month subscription. It renews for a further 12 months unless you cancel at least 30 days before the end of the term: just reply to this email.',
    '',
    'Any changes, just reply to this email.',
    '',
    'TheShowFinder',
  ].join('\n')
  const html = text.split('\n').map(l => l ? `<p style="margin:0 0 8px">${esc(l).replace(esc(cityUrl), `<a href="${cityUrl}">${esc(cityUrl)}</a>`)}</p>` : '').join('')
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to: a.to, bcc: COPY_TO, replyTo: COPY_TO, subject: `${a.businessName} is live on TheShowFinder`, text, html })
  if (error) throw new Error(typeof error === 'object' && 'message' in error ? String(error.message) : String(error))
}

export interface MonthlyStats {
  businessName: string
  city: string
  featured: boolean
  monthLabel: string
  showPages: number
  websiteClicks: number
  bookingClicks: number
  vouchersClaimed: number
  vouchersUsed: number
  hasOffer: boolean
}

export function monthlyReportText(s: MonthlyStats): string {
  const lines = [
    `${s.businessName}: your TheShowFinder report for ${s.monthLabel}`,
    '',
    s.featured ? `Shown on: ${s.showPages.toLocaleString('en-GB')} upcoming show pages in ${s.city}, plus the ${s.city} city page` : `Shown on: the local guide on the ${s.city} city page`,
    `Clicks to your website: ${s.websiteClicks}`,
    `Clicks to your booking page: ${s.bookingClicks}`,
  ]
  if (s.hasOffer || s.vouchersClaimed) lines.push(`Vouchers claimed: ${s.vouchersClaimed}`, `Vouchers used in your venue: ${s.vouchersUsed}`)
  else lines.push('', 'Tip: add an offer (for example "10% off food with your show ticket"). Visitors claim it as a QR voucher and we count every one used. Reply to this email to add one.')
  lines.push('', 'Clicks are counted from real visitors only (automated traffic is filtered out).', '', 'Any questions or changes, just reply.', '', 'TheShowFinder')
  return lines.join('\n')
}

export async function sendMonthlyReport(to: string, s: MonthlyStats) {
  const text = monthlyReportText(s)
  const html = text.split('\n').map(l => l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '').join('')
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, bcc: COPY_TO, replyTo: COPY_TO, subject: `Your TheShowFinder report: ${s.monthLabel}`, text, html })
  if (error) throw new Error(typeof error === 'object' && 'message' in error ? String(error.message) : String(error))
}

/**
 * Founding partner offer, about three weeks into the free month: what the listing has done so far, when the free
 * month ends and the price after it. Sent automatically once (cron founding-partners), copied to hello@.
 */
export function trialCheckInText(s: MonthlyStats, t: { contactName: string; endsOn: string; monthlyPrice: string }): string {
  const lines = [
    `Hi ${t.contactName.split(/\s+/)[0] || 'there'},`,
    '',
    `Here's what ${s.businessName} has had on TheShowFinder in its first three weeks:`,
    '',
    s.featured ? `Shown on: ${s.showPages.toLocaleString('en-GB')} upcoming show pages in ${s.city}, plus the ${s.city} city page` : `Shown on: the local guide on the ${s.city} city page`,
    `Clicks to your website: ${s.websiteClicks}`,
    `Clicks to your booking page: ${s.bookingClicks}`,
  ]
  if (s.hasOffer || s.vouchersClaimed) lines.push(`Vouchers claimed: ${s.vouchersClaimed}`, `Vouchers used in your venue: ${s.vouchersUsed}`)
  else lines.push('', 'Tip: add an offer (for example "10% off food with your show ticket"). It gives people a reason to pick you, and we count every voucher used. Just reply with the offer and we will add it.')
  lines.push(
    '',
    `Your free month ends on ${t.endsOn}. After that it is your founding price of ${t.monthlyPrice} a month and you stay on every show page; there is nothing you need to do. If you would rather stop, just reply before then and you will not be charged.`,
    '',
    'Clicks are counted from real visitors only (automated traffic is filtered out).',
    '',
    'Chris',
    'TheShowFinder',
  )
  return lines.join('\n')
}

export async function sendTrialCheckIn(to: string, s: MonthlyStats, t: { contactName: string; endsOn: string; monthlyPrice: string }) {
  const text = trialCheckInText(s, t)
  const html = text.split('\n').map(l => l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '').join('')
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, bcc: COPY_TO, replyTo: COPY_TO, subject: `${s.businessName}: your first three weeks on TheShowFinder`, text, html })
  if (error) throw new Error(typeof error === 'object' && 'message' in error ? String(error.message) : String(error))
}
