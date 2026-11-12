import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { createAdminClient } from '@/lib/supabase/admin'
import { listingCategory } from '@/lib/advertiserCategory'
import { tidyOffer, tidyPostcode } from '@/lib/businessOffers'
import { geocodePostcode } from '@/lib/businessVouchers'
import { AREA_RADIUS_M, FEATURED_PER_AREA, STANDARD_PER_AREA, countWithinArea } from '@/lib/localPlacements'
import { prospectByRef } from '@/lib/outreachProspect'
import { gbp, foundingOfferOpen, FOUNDING_OFFER_KEY, FOUNDING_TRIAL_DAYS, FOUNDING_PRICES } from '@/lib/advertisingPackages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_FILES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ASSETS = 5

type PackageKey = 'standard' | 'featured'
type BillingKey = 'monthly' | 'yearly'

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'upload'
}


function priceIdFor(packageKey: PackageKey, billing: BillingKey) {
  const key = packageKey === 'featured'
    ? billing === 'monthly' ? 'STRIPE_FEATURED_MONTHLY_PRICE_ID' : 'STRIPE_FEATURED_ANNUAL_PRICE_ID'
    : billing === 'monthly' ? 'STRIPE_STANDARD_MONTHLY_PRICE_ID' : 'STRIPE_STANDARD_ANNUAL_PRICE_ID'
  const priceId = process.env[key]
  return { key, priceId }
}

async function createCheckoutSession({
  request,
  applicationId,
  packageKey,
  billing,
  email,
  city,
  priceId,
  founding,
  ref,
}: {
  request: Request
  applicationId: string
  packageKey: PackageKey
  billing: BillingKey
  email: string
  city: string
  priceId: string
  founding: boolean
  ref: string
}) {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('Stripe is not configured on the server.')
  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.theshowfinder.com'
  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  if (founding && !priceId.startsWith('price_')) {
    // Founding price (£24.95 / £14.95 a month), made at checkout so no extra Stripe price has to be set up. A Stripe
    // price id in STRIPE_FEATURED_FOUNDING_PRICE_ID / STRIPE_STANDARD_FOUNDING_PRICE_ID is used instead when set.
    params.set('line_items[0][price_data][currency]', 'gbp')
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(FOUNDING_PRICES[packageKey] * 100)))
    params.set('line_items[0][price_data][recurring][interval]', 'month')
    params.set('line_items[0][price_data][product_data][name]', `TheShowFinder ${packageKey === 'featured' ? 'Featured placement' : 'Standard listing'} (founding partner price)`)
  } else {
    params.set('line_items[0][price]', priceId)
  }
  params.set('line_items[0][quantity]', '1')
  params.set('customer_email', email)
  params.set('client_reference_id', applicationId)
  params.set('success_url', `${origin}/advertise/success?session_id={CHECKOUT_SESSION_ID}`)
  params.set('cancel_url', `${origin}/advertise/onboard?city=${encodeURIComponent(city)}&package=${packageKey}&payment=cancelled${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`)
  params.set('metadata[application_id]', applicationId)
  params.set('metadata[package]', packageKey)
  params.set('metadata[billing]', billing)
  params.set('metadata[city]', city)
  params.set('subscription_data[metadata][application_id]', applicationId)
  params.set('subscription_data[metadata][package]', packageKey)
  params.set('subscription_data[metadata][billing]', billing)
  // The term: recorded on the subscription (with when it was agreed) and shown above the Pay button.
  const agreedAt = new Date().toISOString()
  const term = founding ? 'monthly, cancel any time' : '12 months'
  params.set('metadata[term]', term)
  params.set('metadata[term_agreed_at]', agreedAt)
  params.set('subscription_data[metadata][term]', term)
  params.set('subscription_data[metadata][term_agreed_at]', agreedAt)
  if (founding) {
    // Founding partner offer: card taken now, nothing charged for FOUNDING_TRIAL_DAYS, then monthly until cancelled.
    params.set('metadata[offer]', FOUNDING_OFFER_KEY)
    params.set('subscription_data[metadata][offer]', FOUNDING_OFFER_KEY)
    params.set('subscription_data[trial_period_days]', String(FOUNDING_TRIAL_DAYS))
    params.set('payment_method_collection', 'always')
    params.set('custom_text[submit][message]', `Founding partner offer: nothing to pay for your first ${FOUNDING_TRIAL_DAYS} days, then your founding price of ${gbp(FOUNDING_PRICES[packageKey])} a month, kept for as long as you stay. Cancel any time by emailing hello@theshowfinder.com. theshowfinder.com/terms#advertising`)
  } else {
    params.set('custom_text[submit][message]', billing === 'monthly'
      ? '12-month subscription: 12 monthly payments. Renews for a further 12 months unless cancelled at least 30 days before the end of the term. theshowfinder.com/terms#advertising'
      : '12-month subscription paid upfront. Renews for a further 12 months unless cancelled at least 30 days before the end of the term. theshowfinder.com/terms#advertising')
  }
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const result = await response.json() as { id?: string; url?: string; error?: { message?: string } }
  if (!response.ok || !result.id || !result.url) throw new Error(result.error?.message || 'Stripe could not create checkout.')
  return result
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const city = text(form.get('city'))
    const packageKey = text(form.get('package')) as PackageKey
    const billingAsked = text(form.get('billing')) as BillingKey
    const businessName = text(form.get('business_name'))
    const category = listingCategory(text(form.get('category')))
    const contactName = text(form.get('contact_name'))
    const email = text(form.get('email')).toLowerCase()
    const phone = text(form.get('phone'))
    const websiteUrl = text(form.get('website_url'))
    const description = text(form.get('description'))
    const postcode = tidyPostcode(text(form.get('postcode')))
    const bookingUrl = text(form.get('booking_url'))
    const offerText = tidyOffer(text(form.get('offer_text')))
    const ref = text(form.get('ref'))
    // Founding partner offer: only for a real outreach link, checked here (not trusted from the form), before 31 Dec.
    const founding = Boolean(ref) && foundingOfferOpen() && Boolean(await prospectByRef(ref))
    const termAgreed = text(form.get('term_agreed')) === 'yes'
    const logo = form.get('logo')
    const assets = form.getAll('assets').filter(value => value instanceof File) as File[]

    if (!CITIES.some(item => item.name === city)) return NextResponse.json({ error: 'Please choose a valid city.' }, { status: 400 })
    if (packageKey !== 'featured' && packageKey !== 'standard') return NextResponse.json({ error: 'Please choose a valid package.' }, { status: 400 })
    const billing: BillingKey = founding ? 'monthly' : billingAsked
    if (billing !== 'monthly' && billing !== 'yearly') return NextResponse.json({ error: 'Please choose a valid billing option.' }, { status: 400 })
    if (!termAgreed) return NextResponse.json({ error: founding ? 'Please confirm the monthly subscription to continue.' : 'Please confirm the 12-month subscription to continue.' }, { status: 400 })
    if (businessName.length < 2 || contactName.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Please provide a business name, contact name and valid email address.' }, { status: 400 })
    }
    if (logo instanceof File && logo.size > 0 && (!ALLOWED_FILES.has(logo.type) || logo.size > MAX_FILE_BYTES)) {
      return NextResponse.json({ error: 'The logo must be a PNG, JPG or WebP file up to 5MB.' }, { status: 400 })
    }
    if (assets.length > MAX_ASSETS || assets.some(file => !ALLOWED_FILES.has(file.type) || file.size > MAX_FILE_BYTES)) {
      return NextResponse.json({ error: 'Please upload no more than five PNG, JPG, WebP or PDF files, up to 5MB each.' }, { status: 400 })
    }

    const normal = priceIdFor(packageKey, billing)
    const foundingEnv = packageKey === 'featured' ? process.env.STRIPE_FEATURED_FOUNDING_PRICE_ID : process.env.STRIPE_STANDARD_FOUNDING_PRICE_ID
    const priceId = founding ? (foundingEnv || 'founding_inline') : normal.priceId
    const priceEnvKey = normal.key
    if (!priceId) return NextResponse.json({ error: `The selected payment option is not configured yet (${priceEnvKey}).` }, { status: 503 })

    const db = createAdminClient()

    // Places are limited per area (everything within walking distance), not per city: at most three Featured and six
    // Standard partners within AREA_RADIUS_M of each other. Featured needs a postcode to place it on the map.
    if (packageKey === 'featured' && !postcode) {
      return NextResponse.json({ error: 'Please add your postcode: Featured partners are shown on the shows within walking distance of you.' }, { status: 400 })
    }
    const place = postcode ? await geocodePostcode(postcode) : null
    if (packageKey === 'featured' && postcode && !place) {
      return NextResponse.json({ error: 'We could not find that postcode. Please check it and try again.' }, { status: 400 })
    }
    if (place) {
      const { data: nearby } = await db.from('local_businesses').select('lat, lng')
        .ilike('city', city).eq('package', packageKey).in('status', ['active', 'paused']).limit(1000) as unknown as { data: { lat: number | null; lng: number | null }[] | null }
      const cap = packageKey === 'featured' ? FEATURED_PER_AREA : STANDARD_PER_AREA
      if (countWithinArea(place, nearby ?? []) >= cap) {
        const miles = (AREA_RADIUS_M / 1609.34).toFixed(0)
        return NextResponse.json({
          error: packageKey === 'featured'
            ? `All ${FEATURED_PER_AREA} Featured places within ${miles} mile of you are taken. Standard is still available, or email hello@theshowfinder.com to join the waiting list.`
            : `All ${STANDARD_PER_AREA} Standard places within ${miles} mile of you are taken. Email hello@theshowfinder.com to join the waiting list.`,
        }, { status: 409 })
      }
    }

    const { data: application, error: insertError } = await db
      .from('advertiser_applications')
      .insert({
        city,
        package: packageKey,
        billing,
        stripe_price_id: priceId,
        business_name: businessName,
        category,
        contact_name: contactName,
        email,
        phone: phone || null,
        website_url: websiteUrl || null,
        description: description || null,
        postcode,
        booking_url: bookingUrl || null,
        offer_text: offerText,
        ...(founding ? { offer: FOUNDING_OFFER_KEY } : {}),
      } as never)
      .select('id')
      .single()

    if (insertError || !application) {
      console.error('[advertiser-onboarding] insert failed', insertError?.message)
      return NextResponse.json({ error: 'We could not save your application. Please try again.' }, { status: 500 })
    }

    const uploadedPaths: string[] = []
    const files: Array<{ file: File; kind: string }> = []
    if (logo instanceof File && logo.size > 0) files.push({ file: logo, kind: 'logo' })
    assets.forEach((file, index) => files.push({ file, kind: `asset-${index + 1}` }))

    for (const { file, kind } of files) {
      const path = `${application.id}/${kind}-${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db.storage.from('advertiser-assets').upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadError) {
        console.error('[advertiser-onboarding] upload failed', uploadError.message)
        await db.from('advertiser_applications').delete().eq('id', application.id)
        return NextResponse.json({ error: 'One of the uploaded files could not be saved. Please try again.' }, { status: 500 })
      }
      uploadedPaths.push(path)
    }

    if (uploadedPaths.length > 0) {
      await db.from('advertiser_applications').update({
        logo_path: uploadedPaths.find(path => path.includes('/logo-')) ?? null,
        asset_paths: uploadedPaths.filter(path => !path.includes('/logo-')),
        updated_at: new Date().toISOString(),
      }).eq('id', application.id)
    }

    // Came from an outreach email (/p/<ref>): mark the business as onboarding so it gets no follow-up.
    if (/^[a-f0-9]{6,20}$/.test(ref)) {
      const loose = db as any // eslint-disable-line @typescript-eslint/no-explicit-any
      await loose.from('outreach_prospects').update({ status: 'onboarding', updated_at: new Date().toISOString() }).eq('ref_code', ref).not('status', 'eq', 'unsubscribed')
    }
    const session = await createCheckoutSession({ request, applicationId: application.id, packageKey, billing, email, city, priceId, founding, ref: founding ? ref : '' })
    await db.from('advertiser_applications').update({
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    }).eq('id', application.id)

    return NextResponse.json({ ok: true, applicationId: application.id, checkoutUrl: session.url })
  } catch (error) {
    console.error('[advertiser-onboarding] unexpected error', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'We could not submit your application. Please try again.' }, { status: 500 })
  }
}
