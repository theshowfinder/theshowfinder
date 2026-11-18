import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateSubmission, autoApproveCheck, MAX_SUBMISSIONS_PER_DAY, type BoostChoice } from '@/lib/organiserEvents'
import { dashboardUrl } from '@/lib/organiserDashboard'
import { getOrCreateOrganiser, publishSubmission, createOrganiserCheckout, startDateIso, emailOrganiser, boostLink, doorLink, payoutsLink, promoterActive, placeListing, SITE } from '@/lib/organiserPublish'
import { resend, FROM_EMAIL } from '@/lib/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '')

// "List your event": save the organiser and the event; publish it now when nothing looks off (else it waits
// for a one-tap check on /admin/event-submissions); open Stripe when they chose a Boost or the Promoter plan.
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    // Bots fill every field, people never see this one; and nobody fills the form in under 4 seconds.
    if (str(form.get('company_url'))) return NextResponse.json({ ok: true, live: false })
    const startedAt = Number(str(form.get('started_at')))
    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 4000) return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 })

    const checked = validateSubmission({
      organiserName: str(form.get('organiser_name')), email: str(form.get('email')), website: str(form.get('website')),
      title: str(form.get('title')), category: str(form.get('category')), date: str(form.get('date')), time: str(form.get('time')),
      venueName: str(form.get('venue_name')), city: str(form.get('city')), postcode: str(form.get('postcode')),
      ticketUrl: str(form.get('ticket_url')), priceFrom: str(form.get('price_from')), description: str(form.get('description')),
      ticketing: str(form.get('ticketing')), freeCapacity: str(form.get('free_capacity')),
      paidPrice: str(form.get('paid_price')), paidCapacity: str(form.get('paid_capacity')),
      ticketPlan: (() => { try { const j = JSON.parse(str(form.get('ticket_plan')) || 'null'); return j && typeof j === 'object' ? j : null } catch { return null } })(),
    }, CITIES.map(c => c.name))
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    const s = checked.value
    const boostAsked = str(form.get('boost')) as BoostChoice
    const boost: BoostChoice = boostAsked === 'boost' || boostAsked === 'promoter' ? boostAsked : 'none'
    if (str(form.get('terms')) !== 'yes') return NextResponse.json({ error: 'Please confirm the listing terms.' }, { status: 400 })

    const db = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loose = db as any
    const organiser = await getOrCreateOrganiser(db, s)

    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { count } = await loose.from('event_submissions').select('id', { count: 'exact', head: true }).eq('organiser_id', organiser.id).gte('created_at', since)
    if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) return NextResponse.json({ error: 'That is a lot of events for one day. Email hello@theshowfinder.com and we will add the rest for you.' }, { status: 429 })

    let imageUrl: string | null = null
    const image = form.get('image')
    if (image instanceof File && image.size > 0) {
      if (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'The photo must be a JPG, PNG or WebP up to 5MB.' }, { status: 400 })
      const path = `${organiser.id}/${Date.now()}.${image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg'}`
      const { error: upErr } = await db.storage.from('event-images').upload(path, image, { contentType: image.type, upsert: false, cacheControl: '31536000' })
      if (upErr) return NextResponse.json({ error: 'The photo could not be saved. Please try a smaller one, or leave it out.' }, { status: 500 })
      imageUrl = db.storage.from('event-images').getPublicUrl(path).data.publicUrl
    }

    // Any UK town can list. It shows on the nearest of our city pages (Ilkeston -> Derby/Nottingham) when one is in reach.
    const place = await placeListing(s.city, s.postcode, CITIES.map(c => c.name))
    const baseCheck = autoApproveCheck(s)
    // An organiser's first paid-ticket event is always checked by a person before it goes on sale.
    const check = s.paidPricePence && !organiser.paid_tickets_approved && baseCheck.approve
      ? { approve: false, reason: 'First paid-ticket event from this organiser: check it is real before it goes on sale' }
      : baseCheck
    const { data: sub, error } = await loose.from('event_submissions').insert({
      organiser_id: organiser.id, title: s.title, category: s.category, start_date: startDateIso(s), venue_name: s.venueName,
      city: place.city, town: s.city, postcode: s.postcode, ticket_url: s.ticketUrl, free_capacity: s.freeCapacity, paid_price_pence: s.paidPricePence, paid_capacity: s.paidCapacity, ticket_plan: s.ticketPlan, price_from: s.priceFrom, description: s.description,
      image_url: imageUrl, review_reason: check.reason, boost: boost === 'none' ? null : boost,
    }).select('id, manage_token').single()
    if (error || !sub) throw new Error(`could not save the event: ${error?.message}`)

    let slug: string | null = null
    if (check.approve) slug = await publishSubmission(db, sub.id)
    else {
      // Needs a look: tell Chris (one email per submission, with the reason).
      await resend.emails.send({
        from: FROM_EMAIL, to: 'hello@theshowfinder.com', subject: `Event listing to check: ${s.title}`,
        text: `${s.organiserName} (${s.email}) listed "${s.title}" at ${s.venueName}, ${s.city} (${s.postcode}, shows on ${place.city}) on ${s.date} ${s.time}.\nWhy it needs a look: ${check.reason}\nTicket link: ${s.ticketUrl ?? (s.paidPricePence ? `none (${s.paidCapacity} paid tickets at £${(s.paidPricePence / 100).toFixed(2)} through us)` : `none (${s.freeCapacity} free tickets through us)`)}\n\nApprove or reject (one tap): ${SITE}/admin/event-submissions`,
      }).catch(err => console.error('[list-your-event] admin email failed', err))
    }

    const live = slug ? `${SITE}/events/${slug}` : null
    await emailOrganiser(s.email, live ? `Your event is live: ${s.title}` : `We've got your event: ${s.title}`, [
      `Hi ${s.organiserName},`,
      live ? `Thanks for listing "${s.title}" on TheShowFinder. It's live now: ${live}` : `Thanks for listing "${s.title}" on TheShowFinder. We'll check it and it will usually be live within a day.`,
      place.nearOf
        ? `It shows on our ${place.city} page (the nearest of our city pages to ${place.nearOf}), the venue page and in search${s.freeCapacity || s.paidPricePence ? '' : ', with a button straight to your ticket page'}.`
        : `Every listing shows on your city page, the venue page and in search${s.freeCapacity || s.paidPricePence ? '' : ', with a button straight to your ticket page'}.`,
      boost === 'none' && !promoterActive(organiser)
        ? `Want more people to see it? Boost it for £9.95 and it's featured at the top of your city page, in "This weekend", our social posts and the weekly email, right up to the night: ${boostLink(sub.id, sub.manage_token)}`
        : '',
      s.paidPricePence
        ? `Selling tickets through TheShowFinder: set up your payouts with Stripe (takes about 5 minutes: your details and the bank account the money goes to). Your tickets go on sale as soon as that's done${live ? '' : ' and we have checked your listing'}: ${payoutsLink(sub.id, sub.manage_token)}`
        : '',
      s.paidPricePence
        ? `Buyers pay your price plus our booking fee; you get your full ticket price. Stripe pays the money into your bank, usually a few days after each sale (a little longer for your first payouts). On the night, scan tickets at the door with this link (keep it private): ${doorLink(sub.id, sub.manage_token)}`
        : '',
      s.freeCapacity
        ? `Your ${s.freeCapacity} free tickets are claimed on your event page. Each person gets a QR ticket by email. On the night, open this link on your phone to scan tickets at the door and see who's coming (keep it private): ${doorLink(sub.id, sub.manage_token)}`
        : '',
      s.freeCapacity || s.paidPricePence
        ? `Your organiser dashboard, to see sales, add ticket types and discount codes, email your ticket holders and get a ticket button for your website (keep it private): ${dashboardUrl(organiser.id)}`
        : '',
      'Any questions, just reply to this email.',
      'Chris, TheShowFinder',
    ].filter(Boolean))

    if (boost !== 'none' && !(boost === 'boost' && promoterActive(organiser))) {
      const checkoutUrl = await createOrganiserCheckout({ kind: boost, submissionId: sub.id, organiserId: organiser.id, email: s.email, title: s.title, manageToken: sub.manage_token })
      return NextResponse.json({ ok: true, live: !!slug, checkoutUrl })
    }
    return NextResponse.json({ ok: true, live: !!slug, next: `/list-your-event/done?s=${sub.id}&t=${sub.manage_token}` })
  } catch (err) {
    console.error('[list-your-event] failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
