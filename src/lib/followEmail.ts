// The two follow emails: "new shows added for something you follow" (daily
// job) and the short "you're following X" confirmation. Links go to our own
// pages, tagged for analytics. Pure module (no '@/' imports).

import { formatShareWhen } from './shareText.ts'
import type { FollowAlertBatch, FollowKind } from './follows.ts'

const SITE = 'https://www.theshowfinder.com'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function followShowUrl(slug: string): string {
  return `${SITE}/events/${slug}?utm_source=follow&utm_medium=email&utm_campaign=new_show`
}

export function followTargetUrl(kind: FollowKind, slug: string): string {
  const path = kind === 'artist' ? 'artists' : 'venues'
  return `${SITE}/${path}/${slug}?utm_source=follow&utm_medium=email&utm_campaign=new_show`
}

function where(venueName: string | null, city: string | null): string | null {
  const parts = [venueName, city].filter((p): p is string => !!p)
  return parts.length ? parts.join(', ') : null
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F5F5F0;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#1A1A2E;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800">TheShow<span style="color:#E8003D">Finder</span></td></tr>
      <tr><td style="padding:24px">${inner}</td></tr>
    </table>
  </td></tr></table></body></html>`
}

export function buildFollowAlertEmail(batch: FollowAlertBatch, unsubscribeUrl: string): { subject: string; html: string; text: string } {
  const { items, totalShows } = batch
  const names = items.map(i => i.name)
  const subject = items.length === 1
    ? (totalShows === 1 ? `New show added: ${items[0].name}` : `${totalShows} new shows added for ${items[0].name}`)
    : `New shows from ${names[0]}${items.length === 2 ? ` and ${names[1]}` : ` and ${items.length - 1} more you follow`}`

  const followedNames = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and others`

  const textLines: string[] = ['New shows have been added for things you follow:', '']
  for (const it of items) {
    textLines.push(it.name.toUpperCase())
    for (const s of it.shows) {
      textLines.push(`- ${s.title}, ${formatShareWhen(s.startISO) ?? ''}${where(s.venueName, s.city) ? `, ${where(s.venueName, s.city)}` : ''}`)
      textLines.push(`  Compare tickets: ${followShowUrl(s.slug)}`)
    }
    if (it.more > 0) textLines.push(`  + ${it.more} more: ${followTargetUrl(it.kind, it.slug)}`)
    textLines.push('')
  }
  textLines.push(`You are getting this because you follow ${followedNames} on TheShowFinder.`)
  textLines.push(`Stop these emails: ${unsubscribeUrl}`)

  const sections = items.map(it => `
    <div style="margin:0 0 22px">
      <div style="font-size:12px;font-weight:700;color:#E8003D;text-transform:uppercase;letter-spacing:0.08em">${it.kind === 'artist' ? 'Artist' : 'Venue'} you follow</div>
      <div style="font-size:20px;font-weight:800;color:#1A1A2E;margin:2px 0 6px">${esc(it.name)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${it.shows.map(s => `
        <tr><td style="padding:12px 0;border-top:1px solid #e2e8f0">
          <a href="${followShowUrl(s.slug)}" style="font-size:16px;font-weight:800;color:#0f172a;text-decoration:none">${esc(s.title)}</a>
          <div style="font-size:14px;color:#475569;margin-top:2px">${esc(formatShareWhen(s.startISO) ?? '')}${where(s.venueName, s.city) ? ` · ${esc(where(s.venueName, s.city) as string)}` : ''}</div>
          <a href="${followShowUrl(s.slug)}" style="display:inline-block;margin-top:8px;background:#E8003D;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:8px">Compare tickets</a>
        </td></tr>`).join('')}
      </table>
      ${it.more > 0 ? `<p style="margin:8px 0 0;font-size:14px"><a href="${followTargetUrl(it.kind, it.slug)}" style="color:#E8003D;font-weight:700;text-decoration:none">+ ${it.more} more show${it.more === 1 ? '' : 's'} →</a></p>` : ''}
    </div>`).join('')

  const html = shell(`
    <p style="margin:0 0 18px;font-size:16px;color:#1A1A2E">New shows have been added for ${items.length === 1 ? 'something' : 'things'} you follow:</p>
    ${sections}
    <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">You are getting this because you follow ${esc(followedNames)} on TheShowFinder. <a href="${esc(unsubscribeUrl)}" style="color:#94a3b8">Stop these emails</a>.</p>`)

  return { subject, html, text: textLines.join('\n') }
}

export function buildFollowConfirmEmail(name: string, kind: FollowKind, slug: string, unsubscribeUrl: string): { subject: string; html: string; text: string } {
  const subject = `You're following ${name}`
  const url = followTargetUrl(kind, slug)
  const text = [
    `You're now following ${name} on TheShowFinder.`,
    '',
    kind === 'artist'
      ? "We'll email you when new dates are announced. No other emails unless you ask for them."
      : "We'll email you when new shows are added at this venue. No other emails unless you ask for them.",
    '',
    `See what's on: ${url}`,
    '',
    `Didn't ask for this, or changed your mind? Stop these emails: ${unsubscribeUrl}`,
  ].join('\n')
  const html = shell(`
    <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#1A1A2E">You&rsquo;re following ${esc(name)}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.5">${kind === 'artist' ? 'We&rsquo;ll email you when new dates are announced.' : 'We&rsquo;ll email you when new shows are added at this venue.'} No other emails unless you ask for them.</p>
    <a href="${url}" style="display:inline-block;background:#E8003D;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:8px">See what&rsquo;s on</a>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">Didn&rsquo;t ask for this, or changed your mind? <a href="${esc(unsubscribeUrl)}" style="color:#94a3b8">Stop these emails</a>.</p>`)
  return { subject, html, text }
}
