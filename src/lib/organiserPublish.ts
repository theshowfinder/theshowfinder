// Server side of "List your event" (rules in organiserEvents.ts): organisers,
// publishing a submission as a real listing, Stripe checkout for Boost and the
// Promoter plan, and switching "featured" on and off.

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { cityPagePath } from '@/lib/cities'
import { comparableVenue, overlap, slugify, londonToUtcIso } from '@/lib/feedImportRules'
import { fallbackEventImage } from '@/lib/eventImages'
import { geocodePostcode } from '@/lib/businessVouchers'
import { nearestCity, SOURCE_REACH_KM } from '@/lib/localEventCity'
import { BOOST_PRICE_GBP, PROMOTER_PRICE_GBP, organiserSlugBase, type CleanSubmission } from '@/lib/organiserEvents'
import type { EventCategory } from '@/lib/types/database'
import { buildBoostedEventDraft } from '@/lib/socialAuto'
import { formatShareWhen } from '@/lib/shareText'
import { buildIndexNowPayload } from '@/lib/indexNow'

type Db = ReturnType<typeof createAdminClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (db: Db) => db as any

export const SITE = 'https://www.theshowfinder.com'
const short = () => randomBytes(4).toString('hex')

export interface OrganiserRow {
  id: string; email: string; name: string; slug: string; website: string | null
  plan: string; plan_status: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null
}

export function promoterActive(o: Pick<OrganiserRow, 'plan' | 'plan_status'> | null | undefined): boolean {
  return !!o && o.plan === 'promoter' && o.plan_status === 'active'
}

export async function getOrCreateOrganiser(db: Db, s: Pick<CleanSubmission, 'email' | 'organiserName' | 'website'>): Promise<OrganiserRow> {
  const { data: existing } = await loose(db).from('organisers').select('*').eq('email', s.email).maybeSingle()
  if (existing) {
    if (s.website && !existing.website) await loose(db).from('organisers').update({ website: s.website, updated_at: new Date().toISOString() }).eq('id', existing.id)
    return existing as OrganiserRow
  }
  const { data, error } = await loose(db).from('organisers')
    .insert({ email: s.email, name: s.organiserName, slug: `${organiserSlugBase(s.organiserName)}-${short()}`, website: s.website })
    .select('*').single()
  if (error || !data) throw new Error(`could not save organiser: ${error?.message}`)
  return data as OrganiserRow
}

// The organiser's venue if we already list it in that city (names compared loosely), else a new venue.
async function resolveVenue(db: Db, name: string, city: string, postcode: string | null, town: string | null): Promise<string> {
  const { data } = await db.from('venues').select('id, name, postcode').ilike('city', city).limit(3000) as unknown as { data: { id: string; name: string; postcode: string | null }[] | null }
  const want = comparableVenue(name)
  const rows = data ?? []
  const exact = rows.find(v => want && comparableVenue(v.name) === want)
  if (exact) return exact.id
  const close = rows
    .map(v => ({ v, score: overlap(v.name, name) + (postcode && v.postcode && v.postcode.replace(/\s/g, '').toUpperCase() === postcode.replace(/\s/g, '').toUpperCase() ? 0.5 : 0) }))
    .filter(x => x.score >= 0.75)
    .sort((a, b) => b.score - a.score)[0]
  if (close) return close.v.id
  const { data: created, error } = await db.from('venues')
    .insert({ name, city, address: town && town.toLowerCase() !== city.toLowerCase() ? `${name}, ${town}` : name, postcode: postcode ?? '', slug: `${slugify(`${name} ${town ?? city}`)}-${short()}` } as never)
    .select('id').single()
  if (error || !created) throw new Error(`could not save venue: ${error?.message}`)
  return (created as { id: string }).id
}

interface SubmissionRow {
  id: string; organiser_id: string; title: string; category: string; start_date: string; venue_name: string; city: string
  postcode: string | null; town: string | null; ticket_url: string; price_from: number | null; description: string | null; image_url: string | null
  status: string; event_id: string | null; boost: string | null; boost_paid_at: string | null; manage_token: string
}

/** Puts an approved submission on the site (once). Returns the listing's slug. */
export async function publishSubmission(db: Db, submissionId: string): Promise<string | null> {
  const { data: sub } = await loose(db).from('event_submissions').select('*').eq('id', submissionId).maybeSingle() as { data: SubmissionRow | null }
  if (!sub) return null
  if (sub.event_id) {
    const { data: ev } = await db.from('events').select('slug').eq('id', sub.event_id).maybeSingle() as unknown as { data: { slug: string } | null }
    return ev?.slug ?? null
  }
  const { data: org } = await loose(db).from('organisers').select('*').eq('id', sub.organiser_id).maybeSingle() as { data: OrganiserRow | null }
  const venueId = await resolveVenue(db, sub.venue_name, sub.city, sub.postcode, sub.town)
  const featured = !!sub.boost_paid_at || promoterActive(org)
  const slug = `${slugify(sub.title) || 'event'}-${short()}`
  const { data: ev, error } = await db.from('events').insert({
    title: sub.title,
    slug,
    category: sub.category as EventCategory,
    venue_id: venueId,
    start_date: sub.start_date,
    status: 'on_sale',
    description: sub.description,
    image_url: sub.image_url ?? fallbackEventImage(sub.category as EventCategory, sub.title),
    price_from: sub.price_from,
    own_ticket_url: sub.ticket_url,
    source: 'organiser',
    source_url: sub.ticket_url,
    organiser_id: sub.organiser_id,
    is_featured: featured,
    boost_until: featured ? sub.start_date : null,
    newly_announced: true,
  } as never).select('id, slug').single() as unknown as { data: { id: string; slug: string } | null; error: { message: string } | null }
  if (error || !ev) throw new Error(`could not create listing: ${error?.message}`)
  await loose(db).from('event_submissions').update({ status: 'approved', event_id: ev.id, reviewed_at: new Date().toISOString() }).eq('id', sub.id)
  if (featured) await queueBoostSocialPost(db, ev.id)
  const cityPath = cityPagePath(sub.city)
  if (cityPath) revalidatePath(cityPath)
  await pingIndexNow([`${SITE}/events/${ev.slug}`, ...(cityPath ? [`${SITE}${cityPath}`] : [])])
  return ev.slug
}

/** A social post draft for a boosted listing (Admin → Social), once per event. Never blocks the boost. */
export async function queueBoostSocialPost(db: Db, eventId: string): Promise<void> {
  try {
    const { data: e } = await loose(db).from('events').select('id, title, slug, start_date, image_url, venue:venues(name, city)').eq('id', eventId).maybeSingle()
    if (!e?.venue?.city) return
    const draft = buildBoostedEventDraft({
      eventId: e.id, title: e.title, whenLabel: formatShareWhen(e.start_date) ?? 'soon', venue: e.venue.name ?? 'the venue',
      city: e.venue.city, imageUrl: e.image_url, slug: e.slug,
    })
    await loose(db).from('social_packs').upsert(draft, { onConflict: 'source_type,source_id,city_name', ignoreDuplicates: true })
  } catch (err) {
    console.error('[list-your-event] social post draft failed', err)
  }
}

/** Paid boost: featured until the event (live now if the listing is up, else as soon as it is approved). */
export async function applyBoost(db: Db, submissionId: string): Promise<void> {
  const now = new Date().toISOString()
  const { data: sub } = await loose(db).from('event_submissions').update({ boost: 'boost', boost_paid_at: now }).eq('id', submissionId).select('event_id, start_date, city').maybeSingle() as { data: { event_id: string | null; start_date: string; city: string } | null }
  if (sub?.event_id) {
    await db.from('events').update({ is_featured: true, boost_until: sub.start_date } as never).eq('id', sub.event_id)
    await queueBoostSocialPost(db, sub.event_id)
    const cityPath = cityPagePath(sub.city)
    if (cityPath) revalidatePath(cityPath)
  }
}

/** Promoter plan on or off: while it is active, every upcoming listing of theirs is featured. */
export async function setPromoterPlan(db: Db, organiserId: string, active: boolean, stripe?: { customer?: string | null; subscription?: string | null; status?: string }): Promise<void> {
  await loose(db).from('organisers').update({
    plan: active ? 'promoter' : 'free',
    plan_status: stripe?.status ?? (active ? 'active' : 'cancelled'),
    ...(stripe?.customer ? { stripe_customer_id: stripe.customer } : {}),
    ...(stripe?.subscription ? { stripe_subscription_id: stripe.subscription } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', organiserId)
  const nowIso = new Date().toISOString()
  if (active) {
    await loose(db).from('events').update({ is_featured: true }).eq('organiser_id', organiserId).gte('start_date', nowIso)
  } else {
    // Back to normal, except listings that have their own paid boost.
    const { data: boosted } = await loose(db).from('event_submissions').select('event_id').eq('organiser_id', organiserId).not('boost_paid_at', 'is', null)
    const keep = new Set(((boosted ?? []) as { event_id: string | null }[]).map(b => b.event_id).filter(Boolean))
    const { data: evs } = await loose(db).from('events').select('id').eq('organiser_id', organiserId).gte('start_date', nowIso)
    const off = ((evs ?? []) as { id: string }[]).map(e => e.id).filter(id => !keep.has(id))
    if (off.length) await loose(db).from('events').update({ is_featured: false }).in('id', off)
  }
}

/** Stripe Checkout for a Boost (one-off) or the Promoter plan (monthly). */
export async function createOrganiserCheckout(opts: { kind: 'boost' | 'promoter'; submissionId: string; organiserId: string; email: string; title: string; manageToken: string }): Promise<string> {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('Payments are not set up yet. Your listing is saved: email hello@theshowfinder.com to boost it.')
  const p = new URLSearchParams()
  const amount = String(Math.round((opts.kind === 'boost' ? BOOST_PRICE_GBP : PROMOTER_PRICE_GBP) * 100))
  p.set('mode', opts.kind === 'boost' ? 'payment' : 'subscription')
  p.set('line_items[0][quantity]', '1')
  p.set('line_items[0][price_data][currency]', 'gbp')
  p.set('line_items[0][price_data][unit_amount]', amount)
  if (opts.kind === 'boost') {
    p.set('line_items[0][price_data][product_data][name]', `Boost: ${opts.title}`.slice(0, 250))
    p.set('line_items[0][price_data][product_data][description]', 'Featured on TheShowFinder until your event: top of your city page, This weekend, social posts and the weekly email.')
  } else {
    p.set('line_items[0][price_data][recurring][interval]', 'month')
    p.set('line_items[0][price_data][product_data][name]', 'TheShowFinder Promoter plan')
    p.set('line_items[0][price_data][product_data][description]', 'Every event you list is featured, plus your own promoter page. Monthly, cancel any time.')
    p.set('subscription_data[metadata][kind]', 'promoter_plan')
    p.set('subscription_data[metadata][organiser_id]', opts.organiserId)
    p.set('custom_text[submit][message]', 'Monthly, cancel any time by emailing hello@theshowfinder.com. theshowfinder.com/terms#event-listings')
  }
  p.set('customer_email', opts.email)
  p.set('client_reference_id', opts.submissionId)
  p.set('metadata[kind]', opts.kind === 'boost' ? 'event_boost' : 'promoter_plan')
  p.set('metadata[submission_id]', opts.submissionId)
  p.set('metadata[organiser_id]', opts.organiserId)
  p.set('success_url', `${SITE}/list-your-event/done?s=${opts.submissionId}&t=${opts.manageToken}&paid=1`)
  p.set('cancel_url', `${SITE}/list-your-event/done?s=${opts.submissionId}&t=${opts.manageToken}`)
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  })
  const json = await res.json() as { id?: string; url?: string; error?: { message?: string } }
  if (!res.ok || !json.url) throw new Error(json.error?.message || 'Payment page could not be opened.')
  return json.url
}

/**
 * Which city page a listing shows on. Our 40 cities are listed as themselves; anywhere else (Ilkeston, a village hall)
 * goes on the nearest of our cities by postcode when it is within reach, and otherwise stays under its own town:
 * still on its event page, the venue page and in search, just not on a city page.
 */
/** Tell Bing (and other IndexNow engines) about a new listing straight away, not at the next daily run. Never throws. */
async function pingIndexNow(urls: string[]): Promise<void> {
  try {
    await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildIndexNowPayload(urls)),
      signal: AbortSignal.timeout(4000),
    })
  } catch (err) {
    console.error('[organiser] IndexNow ping failed', err)
  }
}

export async function placeListing(town: string, postcode: string, cities: string[]): Promise<{ city: string; nearOf: string | null }> {
  if (cities.some(c => c.toLowerCase() === town.toLowerCase())) return { city: town, nearOf: null }
  const geo = await geocodePostcode(postcode)
  if (geo) {
    const near = nearestCity(geo.lat, geo.lng)
    if (near.name && near.km <= SOURCE_REACH_KM) return { city: near.name, nearOf: town }
  }
  return { city: town, nearOf: null }
}

export function startDateIso(s: Pick<CleanSubmission, 'date' | 'time'>): string {
  return londonToUtcIso(s.date, s.time)
}

export function boostLink(submissionId: string, token: string): string {
  return `${SITE}/list-your-event/done?s=${submissionId}&t=${token}`
}

export async function emailOrganiser(to: string, subject: string, lines: string[]): Promise<void> {
  const text = lines.join('\n')
  const html = lines.map(l => (l ? `<p style="margin:0 0 12px">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : '')).join('')
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1A1A2E;max-width:560px">${html}</div>` })
  if (error) console.error('[list-your-event] email failed', error)
}
