// The "tickets go on sale soon" email. Links go to our own event page (never
// straight to a seller), tagged so reminder traffic shows up in analytics.
// Pure module (no '@/' imports) so it runs under `node --test`.

import { formatShareWhen } from './shareText.ts'
import type { DueReminder } from './reminders.ts'

const SITE = 'https://www.theshowfinder.com'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function reminderEventUrl(slug: string): string {
  return `${SITE}/events/${slug}?utm_source=reminder&utm_medium=email&utm_campaign=onsale_reminder`
}

function where(item: DueReminder): string | null {
  const parts = [item.venueName, item.city].filter((p): p is string => !!p)
  return parts.length ? parts.join(', ') : null
}

export function buildReminderEmail(items: DueReminder[]): { subject: string; html: string; text: string } {
  const first = items[0]
  const subject = items.length === 1
    ? `Tickets for ${first.title} go on sale soon`
    : `${items.length} shows you saved go on sale soon`

  const textLines = [
    items.length === 1 ? 'Tickets go on sale soon for a show you asked about:' : 'Tickets go on sale soon for shows you asked about:',
    '',
    ...items.flatMap(i => [
      i.title,
      `On sale: ${formatShareWhen(i.onsaleISO) ?? 'soon'}`,
      ...(where(i) ? [where(i) as string] : []),
      `Where to buy: ${reminderEventUrl(i.slug)}`,
      '',
    ]),
    'You are getting this one-off email because you asked us to remind you. We will not email you again about it.',
    'TheShowFinder, theshowfinder.com',
  ]

  const rows = items.map(i => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #e2e8f0">
      <div style="font-size:18px;font-weight:800;color:#1A1A2E">${esc(i.title)}</div>
      <div style="font-size:15px;color:#E8003D;font-weight:700;margin-top:4px">On sale ${esc(formatShareWhen(i.onsaleISO) ?? 'soon')}</div>
      ${where(i) ? `<div style="font-size:14px;color:#64748b;margin-top:2px">${esc(where(i) as string)}</div>` : ''}
      <a href="${reminderEventUrl(i.slug)}" style="display:inline-block;margin-top:10px;background:#E8003D;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px">See where to buy</a>
    </td></tr>`).join('')

  const html = `<!doctype html><html><body style="margin:0;background:#F5F5F0;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#1A1A2E;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800">TheShow<span style="color:#E8003D">Finder</span></td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 4px;font-size:16px;color:#1A1A2E">${items.length === 1 ? 'Tickets go on sale soon for a show you asked about:' : 'Tickets go on sale soon for shows you asked about:'}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">You are getting this one-off email because you asked us to remind you. We will not email you again about it.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`

  return { subject, html, text: textLines.join('\n') }
}
