// Emails to advertisers: the welcome when a listing goes live (with the staff PIN for vouchers) and the monthly report.
import { resend, FROM_EMAIL } from '@/lib/resend'

const SITE = 'https://www.theshowfinder.com'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const COPY_TO = 'hello@theshowfinder.com'

export async function sendAdvertiserWelcome(a: { to: string; contactName: string; businessName: string; city: string; featured: boolean; offer: string | null; pin: string }) {
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
        'Keep the PIN with your staff only. Every voucher used appears in your monthly report.',
      ]
    : ['Add an offer any time (for example "10% off food with your show ticket"): reply to this email. Listings with an offer get far more visits, and every voucher used is counted in your monthly report.']
  const text = [
    `Hi ${a.contactName},`,
    '',
    `${a.businessName} is now live on TheShowFinder, ${where}.`,
    `See it here: ${cityUrl}`,
    '',
    ...offerLines,
    '',
    'On the 1st of each month we email you a report: how many show pages you appeared on, clicks to your website and booking page, and vouchers claimed and used.',
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
