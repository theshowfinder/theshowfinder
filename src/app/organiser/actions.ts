'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { organiserFrom, dashboardUrl, loadManage } from '@/lib/organiserDashboard'
import { organiserQuery } from '@/lib/organiserAccess'
import { validateTicketType, validateDiscountCode, MAX_TICKET_TYPES, MAX_DISCOUNT_CODES } from '@/lib/ticketPlan'
import { orderLink } from '@/lib/ticketOrders'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const MESSAGES_PER_DAY = 3

const back = (form: FormData, sub: string, msg: string, ok = true) =>
  redirect(`/organiser/event/${sub}?${organiserQuery({ o: String(form.get('o')), e: String(form.get('e')), k: String(form.get('k')) })}&${ok ? 'msg' : 'err'}=${encodeURIComponent(msg)}`)

/** Signed-in organiser and one of their events, or a redirect to sign in. */
async function own(form: FormData) {
  const organiserId = organiserFrom(form)
  if (!organiserId) redirect('/organiser?expired=1')
  const sub = String(form.get('sub') ?? '')
  const m = await loadManage(organiserId, sub)
  if (!m || !m.sub.event_id) redirect(`/organiser?${organiserQuery({ o: String(form.get('o')), e: String(form.get('e')), k: String(form.get('k')) })}`)
  return { organiserId, sub, m: m!, db: createAdminClient() as Loose }
}

/** Email a dashboard link. Same answer whether or not the email is known, so it can't be used to find organisers. */
export async function requestLinkAction(form: FormData) {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const db = createAdminClient() as Loose
    const { data: org } = await db.from('organisers').select('id, name, last_link_sent_at').eq('email', email).maybeSingle()
    const recent = org?.last_link_sent_at && Date.now() - Date.parse(org.last_link_sent_at) < 60_000
    if (org && !recent) {
      await db.from('organisers').update({ last_link_sent_at: new Date().toISOString() }).eq('id', org.id)
      const url = dashboardUrl(org.id)
      await resend.emails.send({
        from: FROM_EMAIL, to: email, subject: 'Your TheShowFinder organiser dashboard',
        text: [`Hi ${org.name ?? 'there'},`, '', 'Here’s your link to manage your events, tickets and discount codes:', url, '', 'It works for 30 days. You can get a new one any time at https://www.theshowfinder.com/organiser', '', 'If you didn’t ask for this, you can ignore this email.', '', 'TheShowFinder'].join('\n'),
      }).catch(err => console.error('[organiser] link email failed', err))
    }
  }
  redirect('/organiser?sent=1')
}

export async function updateTypeAction(form: FormData) {
  const { sub, m, db } = await own(form)
  const t = m.types.find(x => x.id === String(form.get('type')))
  if (!t) back(form, sub, 'That ticket wasn’t found.', false)
  const paid = t!.price_pence > 0
  const checked = validateTicketType({
    name: String(form.get('name') ?? ''), price: paid ? String(form.get('price') ?? '') : '1', capacity: String(form.get('capacity') ?? ''), salesEnd: String(form.get('sales_end') ?? ''),
  }, m.sub.events?.start_date ?? m.sub.start_date)
  if (!checked.ok) back(form, sub, checked.error, false)
  const v = checked.ok ? checked.value : null!
  if (v.capacity < t!.sold) back(form, sub, `You’ve already sold ${t!.sold} ${t!.name} tickets, so there must be at least ${t!.sold}.`, false)
  if (paid && v.price_pence !== t!.price_pence && t!.sold > 0) back(form, sub, 'The price can’t change once tickets have sold. Add a new ticket type at the new price instead.', false)
  if (m.types.some(x => x.id !== t!.id && x.name.toLowerCase() === v.name.toLowerCase())) back(form, sub, `You already have a ticket called “${v.name}”.`, false)
  const update: Record<string, unknown> = { name: v.name, capacity: v.capacity, sales_end: v.sales_end }
  if (paid) update.price_pence = v.price_pence
  if (form.get('pause_field')) update.active = form.get('pause') !== 'yes' && (!paid || await chargesEnabled(db, m.sub.organiser_id))
  await db.from('ticket_types').update(update).eq('id', t!.id).eq('event_id', m.sub.event_id)
  revalidatePath(`/events/${m.sub.events?.slug}`)
  back(form, sub, `${v.name} updated.`)
}

async function chargesEnabled(db: Loose, organiserId: string): Promise<boolean> {
  const { data } = await db.from('organisers').select('stripe_charges_enabled').eq('id', organiserId).maybeSingle()
  return !!data?.stripe_charges_enabled
}

export async function addTypeAction(form: FormData) {
  const { sub, m, db } = await own(form)
  if (m.types.length >= MAX_TICKET_TYPES) back(form, sub, `You can have up to ${MAX_TICKET_TYPES} ticket types.`, false)
  const paidEvent = !!m.sub.paid_price_pence
  const checked = validateTicketType({
    name: String(form.get('name') ?? ''), price: paidEvent ? String(form.get('price') ?? '') : '1', capacity: String(form.get('capacity') ?? ''), salesEnd: String(form.get('sales_end') ?? ''),
  }, m.sub.events?.start_date ?? m.sub.start_date)
  if (!checked.ok) back(form, sub, checked.error, false)
  const v = checked.ok ? checked.value : null!
  if (m.types.some(x => x.name.toLowerCase() === v.name.toLowerCase())) back(form, sub, `You already have a ticket called “${v.name}”.`, false)
  const total = m.types.reduce((n, x) => n + x.capacity, 0) + v.capacity
  if (total > 10000) back(form, sub, 'That’s more than 10,000 tickets in total. Email hello@theshowfinder.com for bigger events.', false)
  await db.from('ticket_types').insert({
    event_id: m.sub.event_id, name: v.name, price_pence: paidEvent ? v.price_pence : 0, capacity: v.capacity, sales_end: v.sales_end,
    sort: Math.max(-1, ...m.types.map(x => x.sort)) + 1, active: paidEvent ? await chargesEnabled(db, m.sub.organiser_id) : true,
  })
  revalidatePath(`/events/${m.sub.events?.slug}`)
  back(form, sub, `${v.name} added.`)
}

export async function addCodeAction(form: FormData) {
  const { sub, m, db } = await own(form)
  if (!m.sub.paid_price_pence) back(form, sub, 'Discount codes are for paid tickets.', false)
  if (m.codes.length >= MAX_DISCOUNT_CODES * 4) back(form, sub, 'That’s a lot of codes. Switch off ones you no longer use, or email hello@theshowfinder.com.', false)
  const checked = validateDiscountCode({ code: String(form.get('code') ?? ''), kind: String(form.get('kind') ?? 'percent'), amount: String(form.get('amount') ?? ''), maxUses: String(form.get('max_uses') ?? ''), expires: String(form.get('expires') ?? '') })
  if (!checked.ok) back(form, sub, checked.error, false)
  const v = checked.ok ? checked.value : null!
  if (m.codes.some(c => c.code === v.code)) back(form, sub, `You already have the code ${v.code}.`, false)
  const { error } = await db.from('discount_codes').insert({ event_id: m.sub.event_id, ...v })
  if (error) back(form, sub, 'That code couldn’t be saved. Please try again.', false)
  back(form, sub, `Code ${v.code} is ready to use.`)
}

export async function toggleCodeAction(form: FormData) {
  const { sub, m, db } = await own(form)
  const c = m.codes.find(x => x.id === String(form.get('code_id')))
  if (!c) back(form, sub, 'That code wasn’t found.', false)
  await db.from('discount_codes').update({ active: !c!.active }).eq('id', c!.id).eq('event_id', m.sub.event_id)
  back(form, sub, c!.active ? `Code ${c!.code} switched off.` : `Code ${c!.code} switched back on.`)
}

/** Email everyone with a ticket (one email per order, with their own ticket link). Reply-to is the organiser. */
export async function messageHoldersAction(form: FormData) {
  const { organiserId, sub, m, db } = await own(form)
  const subject = String(form.get('subject') ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const body = String(form.get('body') ?? '').trim().slice(0, 3000)
  if (subject.length < 3 || body.length < 10) back(form, sub, 'Please add a subject and a message.', false)
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await db.from('organiser_messages').select('id', { count: 'exact', head: true }).eq('event_id', m.sub.event_id).gte('created_at', since)
  if ((count ?? 0) >= MESSAGES_PER_DAY) back(form, sub, `You can send ${MESSAGES_PER_DAY} messages a day for each event. Please try again tomorrow.`, false)
  const { data: org } = await db.from('organisers').select('name, email').eq('id', organiserId).maybeSingle()
  const { data: orders } = await db.from('ticket_orders').select('id, access_token, buyer_name, buyer_email').eq('event_id', m.sub.event_id).eq('status', 'confirmed').limit(5000)
  const byEmail = new Map<string, Loose>()
  for (const o of (orders ?? []) as Loose[]) if (!byEmail.has(o.buyer_email)) byEmail.set(o.buyer_email, o)
  const list = [...byEmail.values()]
  if (!list.length) back(form, sub, 'Nobody has a ticket yet, so there’s no one to email.', false)
  const fromName = String(org?.name ?? 'The organiser').replace(/[<>"]/g, '').slice(0, 60)
  const emails = list.map(o => ({
    from: FROM_EMAIL.replace('TheShowFinder', `${fromName} via TheShowFinder`), to: o.buyer_email, replyTo: org?.email ?? undefined,
    subject: `${subject} (${m.sub.title})`.slice(0, 180),
    text: [`Hi ${o.buyer_name},`, '', body, '', `${fromName}`, '', '—', `You’re getting this because you have tickets for ${m.sub.title}. Reply to this email to reach the organiser.`, `Your tickets: ${orderLink(o.id, o.access_token)}`].join('\n'),
  }))
  let sent = 0
  for (let i = 0; i < emails.length; i += 100) {
    const { error } = await resend.batch.send(emails.slice(i, i + 100))
    if (error) { console.error('[organiser] message batch failed', error); break }
    sent += Math.min(100, emails.length - i)
  }
  await db.from('organiser_messages').insert({ organiser_id: organiserId, event_id: m.sub.event_id, subject, body, recipients: sent })
  back(form, sub, sent === list.length ? `Sent to ${sent} ticket ${sent === 1 ? 'holder' : 'holders'}.` : `Sent to ${sent} of ${list.length}. Please try again later for the rest.`, sent === list.length)
}
