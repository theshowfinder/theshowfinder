// Sending side of outreach (kept apart from outreach.ts so the email text can be unit-tested without Resend).
import { resend } from '@/lib/resend'
import { buildOutreachEmail, canEmail, unsubscribeUrl, OUTREACH_FROM, OUTREACH_REPLY_TO, type Prospect } from '@/lib/outreach'

export async function sendOutreachEmail(p: Prospect, kind: 'first' | 'follow_up'): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canEmail(p)) return { ok: false, error: 'not allowed to email this business (company type or status)' }
  const { subject, text, html } = buildOutreachEmail(p, kind)
  const { error } = await resend.emails.send({
    from: OUTREACH_FROM,
    to: p.email,
    replyTo: OUTREACH_REPLY_TO,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl(p)}>, <mailto:${OUTREACH_REPLY_TO}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  return error ? { ok: false, error: JSON.stringify(error).slice(0, 300) } : { ok: true }
}
