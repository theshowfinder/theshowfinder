import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { createAdminClient } from '@/lib/supabase/admin'
import { listingCategory } from '@/lib/advertiserCategory'
import { tidyOffer, tidyPostcode } from '@/lib/businessOffers'
import { geocodePostcode } from '@/lib/businessVouchers'
import { AREA_RADIUS_M, FEATURED_PER_AREA, STANDARD_PER_AREA, countWithinArea } from '@/lib/localPlacements'
import { resend, FROM_EMAIL } from '@/lib/resend'
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
    // Every sign-up gets the first month free then the monthly price, cancel any time (pricing reset, 20 Nov 2026).
    const founding = foundingOfferOpen()
    const termAgreed = text(form.get('term_agreed')) === 'yes'
    const logo = form.get('logo')
    const assets = form.getAll('assets').filter(value => value instanceof File) as File[]

    if (!CITIES.some(item => item.name === city)) return NextResponse.json({ error: 'Please choose a valid city.' }, { status: 400 })
    if (packageKey !== 'featured' && packageKey !== 'standard') return NextResponse.json({ error: 'Please choose a valid package.' }, { status: 400 })
    const billing: BillingKey = founding ? 'monthly' : billingAsked
    if (billing !== 'monthly' && billing !== 'yearly') return NextResponse.json({ error: 'Please choose a valid billing option.' }, { status: 400 })
    if (!termAgreed) return NextResponse.json({ error: 'Please tick the box to agree to the advertising terms.' }, { status: 400 })
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

    // Tell Chris straight away (before the card step, so he hears even if they don't finish Stripe checkout),
    // with everything they sent and 7-day links to the logo and photos in the private advertiser-assets bucket.
    try {
      const links: string[] = []
      if (uploadedPaths.length) {
        const { data: urls } = await db.storage.from('advertiser-assets').createSignedUrls(uploadedPaths, 7 * 24 * 3600)
        for (const u of urls ?? []) if (u.signedUrl) links.push(`${u.path?.includes('/logo-') ? 'Logo' : 'Photo'}: ${u.signedUrl}`)
      }
      const pkgName = packageKey === 'featured' ? 'Featured' : 'Standard'
      await resend.emails.send({
        from: FROM_EMAIL,
        to: 'hello@theshowfinder.com',
        replyTo: email,
        subject: `New advertiser application: ${businessName} (${city}, ${pkgName})`,
        text: [
          `${businessName} has applied for a ${pkgName} listing in ${city}${founding ? ' (founding offer: first month free)' : ''}.`,
          'They are now being sent to Stripe to add their card. If they do not finish, payment stays "pending".',
          '',
          `Contact: ${contactName}, ${email}${phone ? `, ${phone}` : ''}`,
          `Category: ${category}`,
          `Postcode: ${postcode || '-'}`,
          `Website: ${websiteUrl || '-'}`,
          `Booking link: ${bookingUrl || '-'}`,
          `Customer offer: ${offerText || '-'}`,
          `Description: ${description || '-'}`,
          '',
          links.length ? `Uploads (links work for 7 days):\n${links.join('\n')}` : 'Uploads: none',
          '',
          'Review and approve: https://www.theshowfinder.com/admin/advertiser-applications',
        ].join('\n'),
      })
    } catch (err) {
      console.error('[advertiser-onboarding] notification email failed', err)
    }

    // Came from an outreach email (/p/<ref>): mark the business as onboarding so it gets no follow-up.
    if (/^[a-f0-9]{6,20}$/.test(ref)) {
      const loose = db as any // eslint-disable-line @typescript-eslint/no-explicit-any
      await loose.from('outreach_prospects').update({ status: 'onboarding', updated_at: new Date().toISOString() }).eq('ref_code', ref).not('status', 'eq', 'unsubscribed')
    }
    // No card to join (Chris, 26 Nov 2026): no Stripe checkout here. The free month starts when Chris approves the
    // listing; at the end of it the business gets its results and a link to stay on monthly (src/lib/advertiserStayOn.ts).
    // The business gets a plain "you're in" confirmation now.
    try {
      const monthly = gbp(FOUNDING_PRICES[packageKey])
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        replyTo: 'hello@theshowfinder.com',
        subject: `You're in: ${businessName} on TheShowFinder`,
        text: [
          `Hi ${contactName.split(' ')[0] || contactName},`,
          '',
          `Thanks for signing up ${businessName} to TheShowFinder ${city}. We've got everything we need.`,
          '',
          'What happens next:',
          '- We check your listing and publish it, usually within a day, and email you the links so you can see how it looks.',
          `- Your first ${FOUNDING_TRIAL_DAYS} days are completely free. There is no card to enter and nothing to pay.`,
          `- At the end of the month we send you your results (how many people saw your listing, clicked to book and used your offer), and you choose whether to stay on for ${monthly} a month, cancel any time.`,
          '',
          'If you want to change anything, just reply to this email.',
          '',
          'Chris',
          'TheShowFinder',
        ].join('\n'),
      })
    } catch (err) {
      console.error('[advertiser-onboarding] confirmation email failed', err)
    }

    return NextResponse.json({ ok: true, applicationId: application.id, redirectUrl: '/advertise/success' })
  } catch (error) {
    console.error('[advertiser-onboarding] unexpected error', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'We could not submit your application. Please try again.' }, { status: 500 })
  }
}
