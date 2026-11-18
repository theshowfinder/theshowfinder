// Sending side of backlink outreach: plain personal emails through Resend (same sending address as advertiser outreach).
import { resend } from '@/lib/resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildLinkEmail, LINK_FROM, LINK_REPLY_TO, SITE, type LinkProspect } from '@/lib/linkOutreach'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

export const LINK_SELECT = 'id, kind, name, city, website, email, contact_name, shows, page_url, pitch, subject, body, notes, unsubscribe_token, status, sent_at, venues(slug)'

export function toProspect(r: Loose): LinkProspect {
  return { ...r, venue_slug: r.venues?.slug ?? null, sample_event: /^Sample event: (.+)$/m.exec(r.notes ?? '')?.[1] ?? null }
}

export function draftFor(r: Loose, step: 'first' | 'follow_up' = 'first') {
  return buildLinkEmail(toProspect(r), step)
}

export async function sendLinkEmail(r: Loose, step: 'first' | 'follow_up'): Promise<{ ok: boolean; error?: string }> {
  const p = toProspect(r)
  if (!p.email) return { ok: false, error: 'no email' }
  const { subject, text } = buildLinkEmail(p, step)
  const from = process.env.OUTREACH_FROM_ADDRESS ? `Chris at TheShowFinder <${process.env.OUTREACH_FROM_ADDRESS}>` : LINK_FROM
  const { error } = await resend.emails.send({
    from, to: p.email, replyTo: LINK_REPLY_TO, subject, text,
    headers: { 'List-Unsubscribe': `<${SITE}/unsubscribe/${p.unsubscribe_token}>, <mailto:${LINK_REPLY_TO}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'kind', value: 'link_outreach' }],
  })
  return error ? { ok: false, error: JSON.stringify(error).slice(0, 300) } : { ok: true }
}

export const linkDb = () => createAdminClient() as Loose
