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
      ? `Your first month is free, until ${a.trial.endsOn}, and there is no card to enter. Near the end of the month we will send you your results, and you choose whether to stay on for ${a.trial.monthlyPrice} a month, cancel any time.`
      : 'Your listing is monthly and you can cancel any time: just reply to this email.',
    '',
    `Show customers you're featured: add our badge to your website (it takes a minute): ${SITE}/badge?city=${encodeURIComponent(a.city)}`,
    '',
    'Any changes, just reply to this email.',
    '',
    'TheShowFinder',
  ].join('\n')
  const badgeUrl = `${SITE}/badge?city=${encodeURIComponent(a.city)}`
  const html = text.split('\n').map(l => l ? `<p style="margin:0 0 8px">${esc(l).replace(esc(cityUrl), `<a href="${cityUrl}">${esc(cityUrl)}</a>`).replace(esc(badgeUrl), `<a href="${badgeUrl}">${esc(badgeUrl)}</a>`)}</p>` : '').join('')
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
 * End of the free month (no card to join, Chris 26 Nov 2026): a personal email with what the listing has done, and a
 * personal link to stay on for the monthly price, cancel any time. Sent once by the daily founding-partners job a few
 * days before the free month ends, copied to hello@. Leads with the strongest real numbers; never invents any.
 */
export function stayOnText(s: MonthlyStats, t: { contactName: string; endsOn: string; monthlyPrice: string; stayUrl: string }): string {
  const lines = [
    `Hi ${t.contactName.split(/\s+/)[0] || 'there'},`,
    '',
    `${s.businessName} has now been on TheShowFinder for almost a month, so here are your results so far:`,
    '',
    s.featured ? `- Shown on ${s.showPages.toLocaleString('en-GB')} upcoming show pages in ${s.city}, right under the ticket buttons, plus the ${s.city} city page` : `- Listed in the local guide on the ${s.city} city page`,
  ]
  if (s.websiteClicks) lines.push(`- ${s.websiteClicks} visit${s.websiteClicks === 1 ? '' : 's'} to your website from your listing`)
  if (s.bookingClicks) lines.push(`- ${s.bookingClicks} click${s.bookingClicks === 1 ? '' : 's'} through to book a table`)
  if (s.vouchersClaimed) lines.push(`- ${s.vouchersClaimed} voucher${s.vouchersClaimed === 1 ? '' : 's'} claimed for your offer${s.vouchersUsed ? `, ${s.vouchersUsed} used in your venue` : ''}`)
  lines.push(
    '',
    `Your free month ends on ${t.endsOn}. If you'd like to stay on, it's ${t.monthlyPrice} a month, month by month, with no contract and you can cancel any time. It takes a minute here:`,
    '',
    t.stayUrl,
    '',
    "If you'd rather not, there's nothing to cancel and nothing will be charged.",
    '',
    'Any questions, or anything you would like changed on your listing (photos, offer, wording), just reply to this email.',
    '',
    'Chris',
    'TheShowFinder',
  )
  return lines.join('\n')
}

export async function sendStayOnEmail(to: string, s: MonthlyStats, t: { contactName: string; endsOn: string; monthlyPrice: string; stayUrl: string }) {
  const text = stayOnText(s, t)
  const button = `<p style="margin:16px 0"><a href="${esc(t.stayUrl)}" style="display:inline-block;background:#E8003D;color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Stay on for ${esc(t.monthlyPrice)} a month</a></p>`
  const html = text.split('\n').map(l => l === t.stayUrl ? button : l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '').join('')
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, bcc: COPY_TO, replyTo: COPY_TO, subject: `${s.businessName}: your first month on TheShowFinder`, text, html })
  if (error) throw new Error(typeof error === 'object' && 'message' in error ? String(error.message) : String(error))
}
