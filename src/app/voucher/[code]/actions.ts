'use server'

import { redirect } from 'next/navigation'
import { loadVoucher, saveVoucherEmail, SITE } from '@/lib/businessVouchers'
import { isVoucherCode } from '@/lib/businessOffers'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { subscribeNewsletter } from '@/app/actions/newsletter'

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' })
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Emails the voucher link to the visitor (and signs them up for the newsletter only if they ticked the box). */
export async function emailVoucherAction(code: string, formData: FormData) {
  if (!isVoucherCode(code)) redirect('/')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) redirect(`/voucher/${code}?sent=bad`)
  const v = await loadVoucher(code)
  if (!v) redirect('/')
  const link = `${SITE}/voucher/${code}`
  const last = new Date(new Date(v.expires_at).getTime() - 1).toISOString()
  const when = v.source === 'event' ? `on ${fmtDay(v.valid_from)}` : `until ${fmtDay(last)}`
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Your voucher: ${v.offer_text} at ${v.business.name}`,
    text: `${v.offer_text} at ${v.business.name}, ${v.business.city}.\nValid ${when}.\nYour code: ${code}\nShow this at the counter: ${link}\n\nTheShowFinder`,
    html: `<p><strong>${esc(v.offer_text)}</strong> at ${esc(v.business.name)}, ${esc(v.business.city)}.</p><p>Valid ${esc(when)}.</p><p style="font-size:22px;letter-spacing:3px"><strong>${code}</strong></p><p><a href="${link}">Open your voucher</a> and show it to staff. They scan the QR code to apply your offer.</p><p>TheShowFinder</p>`,
  })
  if (error) { console.error('[voucher] email failed', error); redirect(`/voucher/${code}?sent=fail`) }
  await saveVoucherEmail(code, email)
  if (formData.get('newsletter') === 'on') await subscribeNewsletter(email, v.business.city, { source: 'voucher' })
  redirect(`/voucher/${code}?sent=1`)
}
