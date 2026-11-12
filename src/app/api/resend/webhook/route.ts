import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'

export const dynamic = 'force-dynamic'

// Resend events (Resend dashboard → Webhooks → this URL, events email.bounced and email.complained; signing secret in
// Vercel as RESEND_WEBHOOK_SECRET). The outreach brake (12 Nov 2026):
//  • a spam complaint on an outreach email: that business is unsubscribed and ALL Resend outreach stops until Chris
//    presses Resume on /admin/outreach (protects the newsletter, alerts and advertiser emails on the same account);
//  • a hard bounce: that business is marked bounced; three in 24 hours pause Resend outreach for the rest of the day.
// Chris gets an email either way. Events for other emails (newsletter etc.) are acknowledged and ignored here.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const ALERT_TO = 'hello@theshowfinder.com'

/** Resend signs webhooks the Svix way: HMAC-SHA256 of "id.timestamp.body" with the base64 secret after "whsec_". */
function verified(body: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sigs = headers.get('svix-signature')
  if (!secret || !id || !ts || !sigs) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest()
  return sigs.split(' ').some(s => {
    const got = Buffer.from(s.split(',')[1] ?? '', 'base64')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}

async function alert(subject: string, text: string) {
  try { await resend.emails.send({ from: FROM_EMAIL, to: ALERT_TO, subject, text }) } catch { /* the pause still stands */ }
}

export async function POST(request: Request) {
  const body = await request.text()
  if (!verified(body, request.headers)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string } } }
  if (event.type !== 'email.bounced' && event.type !== 'email.complained') return NextResponse.json({ received: true })

  const db = createAdminClient() as Loose
  const emailId = event.data?.email_id ?? ''
  const to = (Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to) ?? ''
  let { data: p } = await db.from('outreach_prospects').select('id, business_name, email').eq('resend_id', emailId).maybeSingle()
  if (!p && to) ({ data: p } = await db.from('outreach_prospects').select('id, business_name, email').ilike('email', to).not('sent_at', 'is', null).maybeSingle())
  if (!p) return NextResponse.json({ received: true, outreach: false })
  const now = new Date().toISOString()

  if (event.type === 'email.complained') {
    await db.from('outreach_prospects').update({ status: 'unsubscribed', unsubscribed_at: now, notes: 'Marked our email as spam (Resend complaint)', updated_at: now }).eq('id', p.id)
    await db.from('outreach_settings').update({ resend_paused_until: '2100-01-01T00:00:00Z', pause_reason: `Spam complaint from ${p.business_name} (${p.email})`, updated_at: now }).eq('id', 1)
    await alert('Outreach paused: spam complaint', `${p.business_name} (${p.email}) marked an outreach email as spam.\n\nResend outreach is paused to protect the newsletter and site emails. Zoho outreach carries on.\nResume when you're ready: https://www.theshowfinder.com/admin/outreach`)
    return NextResponse.json({ received: true, paused: true })
  }

  // Bounce: a soft ("Transient") bounce is only noted; a hard one marks the business and counts towards the brake.
  if (event.data?.bounce?.type && event.data.bounce.type !== 'Permanent') {
    await db.from('outreach_prospects').update({ last_error: `Soft bounce (${event.data.bounce.type})`, updated_at: now }).eq('id', p.id)
    return NextResponse.json({ received: true })
  }
  await db.from('outreach_prospects').update({ status: 'bounced', last_error: 'Email bounced (address does not exist)', updated_at: now }).eq('id', p.id)
  const { count } = await db.from('outreach_prospects').select('id', { count: 'exact', head: true }).eq('status', 'bounced').gte('updated_at', new Date(Date.now() - 86_400_000).toISOString())
  if ((count ?? 0) >= 3) {
    await db.from('outreach_settings').update({ resend_paused_until: new Date(Date.now() + 20 * 3_600_000).toISOString(), pause_reason: `${count} bounced outreach emails in 24 hours`, updated_at: now }).eq('id', 1)
    await alert('Outreach paused for today: bounces', `${count} outreach emails bounced in the last 24 hours (latest: ${p.business_name}, ${p.email}). Resend outreach is paused until tomorrow and restarts on its own.`)
  }
  return NextResponse.json({ received: true })
}
