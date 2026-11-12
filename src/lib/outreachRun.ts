// One outreach sending run, for either channel (cron outreach-send = Resend, outreach-send-zoho = Zoho).
//  • Follow-ups first: one, FOLLOW_UP_AFTER_DAYS after the first email, only to businesses that clicked through, sent
//    the same way as their first email so it threads in their inbox.
//  • Then new businesses: cities take turns (least emailed first); within a city independents before chains, and
//    businesses near the busiest venues (most shows in the next 60 days) before quieter ones (12 Nov 2026).
//  • Each business is claimed for one channel before sending, so the two senders never email the same business.
//  • The brake (outreach_settings): a channel that is paused sends nothing; a Zoho refusal pauses Zoho for the day.
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages } from '@/lib/pagedFetch'
import { LISTED_EVENTS_VIEW, LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { canEmail, subjectVariantFor, looksLikeChain, spreadAcrossCities, DAILY_LIMIT, ZOHO_DAILY_LIMIT, FOLLOW_UP_AFTER_DAYS, NO_RESPONSE_AFTER_DAYS, type Prospect } from '@/lib/outreach'
import { sendOutreachEmail, sendOutreachEmailZoho, zohoConfigured, type SendResult } from '@/lib/outreachSend'
import { loadOutreachShow } from '@/lib/outreachShow'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
export type Channel = 'resend' | 'zoho'
const COLS = 'id, business_name, category, city, near_venue, distance_label, contact_name, email, company_type, status, ref_code, unsubscribe_token, sent_at, subject_variant, sent_via, created_at'
const LIMIT: Record<Channel, number> = { resend: DAILY_LIMIT, zoho: ZOHO_DAILY_LIMIT }

/** Rows sent by this channel (older rows have no sent_via: they all went by Resend). */
const byChannel = (q: Loose, channel: Channel) => channel === 'resend' ? q.or('sent_via.is.null,sent_via.eq.resend') : q.eq('sent_via', 'zoho')

/** Shows in the next 60 days at each of these venues. */
async function venueShows(db: Loose, venues: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!venues.length) return out
  const to = new Date(Date.now() + 60 * 86_400_000).toISOString()
  for (let i = 0; i < venues.length; i += 100) {
    const rows = await fetchAllPages<{ venue_name: string }>((from, end) => db.from(LISTED_EVENTS_VIEW).select('venue_name, id')
      .in('venue_name', venues.slice(i, i + 100)).in('status', LIVE_EVENT_STATUSES).gte('start_date', new Date().toISOString()).lte('start_date', to).order('id').range(from, end))
    for (const r of rows) out.set(r.venue_name, (out.get(r.venue_name) ?? 0) + 1)
  }
  return out
}

export async function runOutreachSend(channel: Channel, perRun: number, opts: { dry?: boolean } = {}) {
  const dry = Boolean(opts.dry)
  const db = createAdminClient() as Loose
  const sent: string[] = [], failed: string[] = []

  const { data: settings } = await db.from('outreach_settings').select('resend_paused_until, zoho_paused_until, pause_reason').eq('id', 1).maybeSingle()
  const pausedUntil = settings?.[`${channel}_paused_until`]
  if (pausedUntil && Date.parse(pausedUntil) > Date.now()) return { success: true, channel, dry, sent, failed, note: `paused until ${pausedUntil}: ${settings?.pause_reason ?? ''}` }
  if (channel === 'zoho' && !zohoConfigured()) return { success: true, channel, dry, sent, failed, note: 'Zoho not set up yet (ZOHO_SMTP_USER / ZOHO_SMTP_PASS in Vercel)' }

  // Followed up and still nothing after NO_RESPONSE_AFTER_DAYS: "No response", never chased again.
  if (!dry && channel === 'resend') {
    const cutoff = new Date(Date.now() - NO_RESPONSE_AFTER_DAYS * 86_400_000).toISOString()
    await db.from('outreach_prospects').update({ status: 'no_response', updated_at: new Date().toISOString() }).eq('status', 'followed_up').lte('sent_at', cutoff)
  }
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const [{ count: firstToday }, { count: followToday }] = await Promise.all([
    byChannel(db.from('outreach_prospects').select('id', { count: 'exact', head: true }).gte('sent_at', dayStart.toISOString()), channel),
    byChannel(db.from('outreach_prospects').select('id', { count: 'exact', head: true }).gte('followed_up_at', dayStart.toISOString()), channel),
  ])
  let budget = Math.min(perRun, LIMIT[channel] - (firstToday ?? 0) - (followToday ?? 0))
  if (budget <= 0) return { success: true, channel, dry, sent, failed, note: 'daily limit reached' }

  const followBefore = new Date(Date.now() - FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString()
  const [firsts, sentRows, { data: follows }] = await Promise.all([
    fetchAllPages<Prospect & { created_at: string }>((from, to) => db.from('outreach_prospects').select(COLS).eq('status', 'approved').is('sent_via', null).order('created_at').order('id').range(from, to)),
    fetchAllPages<{ city: string }>((from, to) => db.from('outreach_prospects').select('city').not('sent_at', 'is', null).order('id').range(from, to)),
    byChannel(db.from('outreach_prospects').select(COLS).eq('status', 'sent').not('clicked_at', 'is', null).lte('sent_at', followBefore), channel).order('sent_at').limit(budget),
  ])
  const sentByCity = new Map<string, number>()
  for (const r of sentRows) sentByCity.set(r.city, (sentByCity.get(r.city) ?? 0) + 1)
  const busy = await venueShows(db, [...new Set(firsts.map(f => f.near_venue).filter((v): v is string => Boolean(v)))])
  const isChain = (r: Prospect) => looksLikeChain({ name: r.business_name, email: r.email })
  const ordered = [...firsts].sort((a, b) => Number(isChain(a)) - Number(isChain(b)) || (busy.get(b.near_venue ?? '') ?? 0) - (busy.get(a.near_venue ?? '') ?? 0))
  const queue: Array<{ p: Prospect; kind: 'first' | 'follow_up' }> = [
    ...((follows ?? []) as Prospect[]).map(p => ({ p, kind: 'follow_up' as const })),
    ...spreadAcrossCities(ordered, budget, sentByCity).map(p => ({ p, kind: 'first' as const })),
  ]

  for (const { p, kind } of queue) {
    if (budget <= 0) break
    // Safety stop: several failures in one run (rejected addresses, a sending problem) and the rest wait for a person.
    if (failed.length >= 3) break
    if (!canEmail(p)) continue
    if (dry) { budget--; sent.push(`${kind}: ${p.business_name} <${p.email}>`); continue }
    // Claim a new business for this channel first, so the other sender cannot take it at the same time.
    if (kind === 'first') {
      const { data: claimed } = await db.from('outreach_prospects').update({ sent_via: channel }).eq('id', p.id).eq('status', 'approved').is('sent_via', null).select('id')
      if (!claimed?.length) continue
    }
    budget--
    // First emails get a subject version (see outreachSubject), saved with sent_at so the follow-up replies to it.
    const variant = kind === 'first' ? subjectVariantFor(p.id) : null
    const show = await loadOutreachShow(db, p)
    const prospect = variant ? { ...p, subject_variant: variant } : p
    const r: SendResult = channel === 'zoho' ? await sendOutreachEmailZoho(prospect, kind, show) : await sendOutreachEmail(prospect, kind, show)
    const now = new Date().toISOString()
    if (r.ok) {
      sent.push(`${kind}: ${p.business_name}`)
      await db.from('outreach_prospects').update(kind === 'first'
        ? { status: 'sent', sent_at: now, subject_variant: variant, ...(channel === 'resend' && r.id ? { resend_id: r.id } : {}), last_error: null, updated_at: now }
        : { status: 'followed_up', followed_up_at: now, last_error: null, updated_at: now }).eq('id', p.id)
    } else {
      failed.push(`${p.business_name}: ${r.error}`)
      await db.from('outreach_prospects').update({ last_error: r.error, updated_at: now, ...(kind === 'first' ? { sent_via: null } : {}) }).eq('id', p.id)
      if (channel === 'zoho' && r.fatal) {
        await db.from('outreach_settings').update({ zoho_paused_until: new Date(Date.now() + 20 * 3_600_000).toISOString(), pause_reason: `Zoho refused a send: ${r.error.slice(0, 200)}`, updated_at: now }).eq('id', 1)
        break
      }
    }
    // Zoho: a short gap between emails, so they go out one by one like a person's.
    if (channel === 'zoho') await new Promise(res => setTimeout(res, 8000))
  }
  return { success: failed.length === 0, channel, dry, sent, failed }
}
