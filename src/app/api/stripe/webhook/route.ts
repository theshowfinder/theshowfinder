import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { PACKAGES, gbp, FOUNDING_OFFER_KEY, FOUNDING_TRIAL_DAYS, FOUNDING_PRICES } from '@/lib/advertisingPackages'
import { applyBoost, setPromoterPlan, emailOrganiser, SITE } from '@/lib/organiserPublish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validSignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(',').map(item => {
    const [key, value] = item.split('=')
    return [key, value]
  }))
  const timestamp = Number(parts.t)
  const signatures = signature.split(',').filter(item => item.startsWith('v1=')).map(item => item.slice(3))
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return signatures.some(value => {
    try { return timingSafeEqual(Buffer.from(expected), Buffer.from(value)) } catch { return false }
  })
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')
  if (!secret || !signature) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 400 })
  const payload = await request.text()
  if (!validSignature(payload, signature, secret)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 })

  const event = JSON.parse(payload) as { type: string; data?: { object?: Record<string, unknown> } }
  const object = event.data?.object ?? {}
  const metadata = (object.metadata ?? {}) as Record<string, string>
  // Invoices carry the subscription's metadata under subscription_details (parent.subscription_details on newer API versions).
  const subMeta = ((object.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata
    ?? (object.parent as { subscription_details?: { metadata?: Record<string, string> } } | undefined)?.subscription_details?.metadata ?? {})
  // "List your event" payments (src/lib/organiserPublish.ts): a Boost or the Promoter plan.
  const organiserKind = metadata.kind || subMeta.kind
  if (organiserKind === 'event_boost' || organiserKind === 'promoter_plan') {
    await handleOrganiserPayment(event.type, object, { ...subMeta, ...metadata })
    return NextResponse.json({ received: true })
  }

  const applicationId = metadata.application_id || subMeta.application_id || (typeof object.client_reference_id === 'string' ? object.client_reference_id : '')
  if (!applicationId) return NextResponse.json({ received: true })

  const db = createAdminClient()
  // "Stay on" after the free month (src/app/advertise/stay): the business is now paying monthly. Record it on the
  // application and the listing's account, and tell Chris. Later invoices and cancellations go through the code below.
  if (metadata.kind === 'advertiser_stay_on' && (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')) {
    const loose = db as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const customer = typeof object.customer === 'string' ? object.customer : null
    const subscription = typeof object.subscription === 'string' ? object.subscription : null
    const { data: app } = await loose.from('advertiser_applications').update({
      payment_status: 'paid', stripe_customer_id: customer, stripe_subscription_id: subscription, updated_at: new Date().toISOString(),
    }).eq('id', applicationId).select('business_id, business_name, city, package, email').maybeSingle()
    if (app?.business_id) {
      await loose.from('local_business_accounts').update({ stripe_customer_id: customer, stripe_subscription_id: subscription, billing: 'monthly' }).eq('business_id', app.business_id)
    }
    if (app) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL, to: 'hello@theshowfinder.com',
          subject: `Staying on: ${app.business_name} (${app.city}, ${app.package === 'featured' ? 'Featured' : 'Standard'})`,
          text: `${app.business_name} in ${app.city} has chosen to stay on and is now paying monthly (${gbp(FOUNDING_PRICES[app.package === 'featured' ? 'featured' : 'standard'])}). Contact: ${app.email}.`,
        })
      } catch (err) { console.error('[stripe-webhook] stay-on notice failed', err) }
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    // Founding partner offer: card saved, nothing charged yet, free until trial_ends_at (then Stripe bills monthly).
    const founding = metadata.offer === FOUNDING_OFFER_KEY
    const trialEnds = new Date(Date.now() + FOUNDING_TRIAL_DAYS * 86_400_000)
    const { data: application, error } = await db.from('advertiser_applications').update({
      payment_status: founding ? 'trial' : 'paid',
      ...(founding ? { trial_ends_at: trialEnds.toISOString() } : {}),
      stripe_customer_id: typeof object.customer === 'string' ? object.customer : null,
      stripe_subscription_id: typeof object.subscription === 'string' ? object.subscription : null,
      updated_at: new Date().toISOString(),
    } as never).eq('id', applicationId).is('confirmation_email_sent_at', null).select('email,business_name,city,package,billing').maybeSingle()

    if (error) {
      console.error('[stripe-webhook] failed to update paid application', error.message)
    } else if (application) {
      const packageName = application.package === 'featured' ? 'Featured advertising' : 'Standard advertising'
      const billingLabel = application.billing === 'yearly' ? 'annual billing' : 'monthly billing'
      const pkgKey = application.package === 'featured' ? 'featured' : 'standard'
      const price = gbp(founding ? FOUNDING_PRICES[pkgKey] : PACKAGES[pkgKey].monthly)
      const endsOn = trialEnds.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
      const confirmed = founding
        ? `Your ${packageName.toLowerCase()} application for ${application.city} has been received and your free month has started. Nothing is charged until ${endsOn}; after that it is your founding price of ${price} a month, kept for as long as you stay, and you can cancel any time by replying to this email.`
        : `Your ${packageName.toLowerCase()} application for ${application.city} has been received and payment has been confirmed on ${billingLabel}.`
      const { error: emailError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: application.email,
        subject: 'TheShowFinder advertising application received',
        text: [
          `Thanks for signing up for TheShowFinder advertising, ${application.business_name}.`,
          '',
          confirmed,
          '',
          'What happens next:',
          '• We will review your details and uploaded assets.',
          '• We will contact you if anything else is needed.',
          '• Once approved, we will prepare and publish your listing.',
          '',
          'Your listing is not live yet because all advertiser applications are manually reviewed.',
          '',
          'TheShowFinder',
        ].join('\n'),
        html: `<p>Thanks for signing up for TheShowFinder advertising, ${application.business_name}.</p><p>${confirmed}</p><p><strong>What happens next:</strong></p><ul><li>We will review your details and uploaded assets.</li><li>We will contact you if anything else is needed.</li><li>Once approved, we will prepare and publish your listing.</li></ul><p>Your listing is not live yet because all advertiser applications are manually reviewed.</p><p>TheShowFinder</p>`,
      })
      if (emailError) {
        console.error('[stripe-webhook] confirmation email failed', emailError)
      } else {
        await db.from('advertiser_applications').update({
          confirmation_email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', applicationId).is('confirmation_email_sent_at', null)
      }
    }
  } else if (event.type === 'invoice.paid') {
    // First real payment after a founding free month: the business is now paying.
    if (Number(object.amount_paid ?? 0) > 0) {
      await db.from('advertiser_applications').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', applicationId).eq('payment_status', 'trial')
    }
  } else if (event.type === 'invoice.payment_failed') {
    await db.from('advertiser_applications').update({ payment_status: 'pending', updated_at: new Date().toISOString() }).eq('id', applicationId)
  } else if (event.type === 'customer.subscription.deleted') {
    const { data: app } = await db.from('advertiser_applications').update({ payment_status: 'pending', updated_at: new Date().toISOString() }).eq('id', applicationId).select('business_id, city').maybeSingle() as unknown as { data: { business_id: string | null; city: string } | null }
    // Subscription ended: take the live listing down (it can be set live again on /admin/local-businesses).
    if (app?.business_id) {
      await db.from('local_businesses').update({ status: 'cancelled', updated_at: new Date().toISOString() } as never).eq('id', app.business_id)
      revalidatePath('/cities/' + encodeURIComponent(app.city))
    }
  }
  return NextResponse.json({ received: true })
}

async function handleOrganiserPayment(type: string, object: Record<string, unknown>, meta: Record<string, string>) {
  const db = createAdminClient()
  const organiserId = meta.organiser_id
  const submissionId = meta.submission_id
  try {
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      if (meta.kind === 'event_boost' && submissionId) {
        await applyBoost(db, submissionId)
      } else if (meta.kind === 'promoter_plan' && organiserId) {
        await setPromoterPlan(db, organiserId, true, {
          customer: typeof object.customer === 'string' ? object.customer : null,
          subscription: typeof object.subscription === 'string' ? object.subscription : null,
          status: 'active',
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sub } = submissionId ? await (db as any).from('event_submissions').select('status, title, review_reason, organisers(email, name)').eq('id', submissionId).maybeSingle() : { data: null }
      const email = sub?.organisers?.email as string | undefined
      if (email) {
        await emailOrganiser(email, meta.kind === 'event_boost' ? `Boost confirmed: ${sub.title}` : 'Welcome to the TheShowFinder Promoter plan', [
          `Hi ${sub.organisers?.name ?? 'there'},`,
          meta.kind === 'event_boost'
            ? `Thanks, your boost for "${sub.title}" is confirmed. ${sub.status === 'approved' ? 'It is featured now' : 'It will be featured as soon as the listing is live'}, right up to the night.`
            : 'Thanks for joining the Promoter plan. Every event you list is now boosted automatically, and you have your own promoter page. List your next event any time: ' + `${SITE}/list-your-event`,
          'Your receipt comes separately from Stripe. To cancel or change anything, just reply to this email.',
          'Chris, TheShowFinder',
        ])
      }
    } else if (type === 'customer.subscription.deleted' && meta.kind === 'promoter_plan' && organiserId) {
      await setPromoterPlan(db, organiserId, false, { status: 'cancelled' })
    } else if (type === 'invoice.payment_failed' && meta.kind === 'promoter_plan' && organiserId) {
      // Stripe retries the card for a while; the plan only ends if the subscription is cancelled.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('organisers').update({ plan_status: 'past_due', updated_at: new Date().toISOString() }).eq('id', organiserId)
    } else if (type === 'invoice.paid' && meta.kind === 'promoter_plan' && organiserId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('organisers').update({ plan: 'promoter', plan_status: 'active', updated_at: new Date().toISOString() }).eq('id', organiserId)
    }
  } catch (err) {
    console.error('[stripe-webhook] organiser payment handling failed', err)
  }
}
