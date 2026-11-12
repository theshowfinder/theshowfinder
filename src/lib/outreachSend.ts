// Sending side of outreach (kept apart from outreach.ts so the email text can be unit-tested without Resend).
// Two channels (12 Nov 2026): Resend (the visual email) and Chris's Zoho mailbox over SMTP (the same words as a plain,
// personal email: one at a time, a few each quarter hour), so outreach can grow without putting everything on Resend.
import nodemailer from 'nodemailer'
import { resend } from '@/lib/resend'
import { buildOutreachEmail, canEmail, unsubscribeUrl, OUTREACH_FROM, OUTREACH_REPLY_TO, type OutreachShow, type Prospect } from '@/lib/outreach'

export type SendResult = { ok: true; id?: string } | { ok: false; error: string; fatal?: boolean }

const unsubscribeHeaders = (p: Prospect) => ({
  'List-Unsubscribe': `<${unsubscribeUrl(p)}>, <mailto:${OUTREACH_REPLY_TO}?subject=unsubscribe>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
})

export async function sendOutreachEmail(p: Prospect, kind: 'first' | 'follow_up', show?: OutreachShow): Promise<SendResult> {
  if (!canEmail(p)) return { ok: false, error: 'not allowed to email this business (company type or status)' }
  const { subject, text, html } = buildOutreachEmail(p, kind, { show })
  const { data, error } = await resend.emails.send({
    // OUTREACH_FROM_ADDRESS (Vercel) moves outreach onto its own sending subdomain (e.g. partners@go.theshowfinder.com,
    // verified in Resend) so its reputation is kept apart from the newsletter and site emails on theshowfinder.com.
    from: process.env.OUTREACH_FROM_ADDRESS ? `TheShowFinder <${process.env.OUTREACH_FROM_ADDRESS}>` : OUTREACH_FROM,
    to: p.email,
    replyTo: OUTREACH_REPLY_TO,
    subject,
    text,
    html,
    headers: unsubscribeHeaders(p),
    tags: [{ name: 'kind', value: 'outreach' }],
  })
  return error ? { ok: false, error: JSON.stringify(error).slice(0, 300) } : { ok: true, id: data?.id }
}

/** Zoho SMTP is set up when ZOHO_SMTP_USER and ZOHO_SMTP_PASS (an app password) are in Vercel. */
export const zohoConfigured = () => Boolean(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS)

let transport: nodemailer.Transporter | null = null
function zoho() {
  transport ??= nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_SMTP_USER!, pass: process.env.ZOHO_SMTP_PASS! },
  })
  return transport
}

export async function sendOutreachEmailZoho(p: Prospect, kind: 'first' | 'follow_up', show?: OutreachShow): Promise<SendResult> {
  if (!canEmail(p)) return { ok: false, error: 'not allowed to email this business (company type or status)' }
  if (!zohoConfigured()) return { ok: false, error: 'Zoho is not set up (ZOHO_SMTP_USER / ZOHO_SMTP_PASS)', fatal: true }
  // Plain text only: reads like a person's email, which is what it is.
  const { subject, text } = buildOutreachEmail(p, kind, { show })
  const user = process.env.ZOHO_SMTP_USER!
  try {
    const info = await zoho().sendMail({
      from: process.env.ZOHO_FROM || `Chris at TheShowFinder <${user}>`,
      to: p.email,
      replyTo: process.env.ZOHO_FROM || user,
      subject,
      text,
      headers: unsubscribeHeaders(p),
    })
    return { ok: true, id: info.messageId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // An authentication, limit or policy refusal stops Zoho for the day; a single bad address does not.
    const fatal = !/recipient|mailbox unavailable|user unknown|no such user|550 5\.1\.1/i.test(msg)
    return { ok: false, error: msg.slice(0, 300), fatal }
  }
}
