'use server'

// Approving a paid advertiser application (the /advertise sign-up and Stripe flow) makes it a live listing:
// the business goes into local_businesses (what the city guide and the "Before the show" box show), the contact and
// Stripe details into local_business_accounts, and the application is marked approved and linked to it.
// Pausing, cancelling and switching package are then done on /admin/local-businesses as for any listing.
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listingCategory } from '@/lib/advertiserCategory'
import { geocodePostcode, newPin } from '@/lib/businessVouchers'
import { tidyOffer } from '@/lib/businessOffers'
import { sendAdvertiserWelcome } from '@/lib/advertiserEmails'
import { gbp, FOUNDING_OFFER_KEY, FOUNDING_PRICES, FOUNDING_TRIAL_DAYS } from '@/lib/advertisingPackages'
import { buildPartnerDraft } from '@/lib/socialAuto'

const LOGO_BUCKET = 'business-logos'   // public (migration 094); advertiser-assets stays private

/* eslint-disable @typescript-eslint/no-explicit-any */
async function publicLogoUrl(db: any, applicationId: string, logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null
  const { data: file, error } = await db.storage.from('advertiser-assets').download(logoPath)
  if (error || !file) { console.error('[advertiser-approve] logo download failed', error?.message); return null }
  const name = `${applicationId}/${logoPath.split('/').pop()}`
  const { error: upErr } = await db.storage.from(LOGO_BUCKET).upload(name, file, { contentType: file.type || 'image/png', upsert: true, cacheControl: '86400' })
  if (upErr) { console.error('[advertiser-approve] logo upload failed', upErr.message); return null }
  return db.storage.from(LOGO_BUCKET).getPublicUrl(name).data.publicUrl as string
}

/** Copies the advertiser's uploaded photos (images only, not PDFs) to the public bucket; returns their public URLs. */
async function publicPhotoUrls(db: any, applicationId: string, assetPaths: string[] | null): Promise<string[]> {
  const urls: string[] = []
  for (const path of (assetPaths ?? []).filter(p => /\.(jpe?g|png|webp)$/i.test(p)).slice(0, 5)) {
    const { data: file, error } = await db.storage.from('advertiser-assets').download(path)
    if (error || !file) { console.error('[advertiser-approve] photo download failed', error?.message); continue }
    const name = `${applicationId}/${path.split('/').pop()}`
    const { error: upErr } = await db.storage.from(LOGO_BUCKET).upload(name, file, { contentType: file.type || 'image/jpeg', upsert: true, cacheControl: '86400' })
    if (upErr) { console.error('[advertiser-approve] photo upload failed', upErr.message); continue }
    urls.push(db.storage.from(LOGO_BUCKET).getPublicUrl(name).data.publicUrl as string)
  }
  return urls
}

export async function approveApplicationAction(applicationId: string) {
  await requireAdmin()
  const db: any = createAdminClient()
  const { data: app, error } = await db.from('advertiser_applications').select('*').eq('id', applicationId).single()
  if (error || !app) throw new Error(`application not found: ${error?.message ?? applicationId}`)

  const logo_url = await publicLogoUrl(db, app.id, app.logo_path)
  const photo_urls = await publicPhotoUrls(db, app.id, app.asset_paths)
  const place = await geocodePostcode(app.postcode)
  const listing = {
    city: app.city,
    name: app.business_name,
    category: listingCategory(app.category),
    description: app.description,
    website_url: app.website_url,
    package: app.package === 'featured' ? 'featured' : 'standard',
    is_sponsored: app.package === 'featured',
    status: 'active',
    offer_text: tidyOffer(app.offer_text),
    booking_url: app.booking_url ?? null,
    updated_at: new Date().toISOString(),
    ...(logo_url ? { logo_url } : {}),
    ...(photo_urls.length ? { photo_urls } : {}),
    ...(place ? { postcode: place.postcode, lat: place.lat, lng: place.lng } : {}),
  }

  let businessId: string | null = app.business_id ?? null
  if (businessId) {
    const { error: upErr } = await db.from('local_businesses').update(listing).eq('id', businessId)
    if (upErr) throw new Error(`update listing: ${upErr.message}`)
  } else {
    const { data: created, error: insErr } = await db.from('local_businesses').insert({ ...listing, display_order: 0, is_lusso_client: false }).select('id').single()
    if (insErr || !created) throw new Error(`create listing: ${insErr?.message}`)
    businessId = created.id as string
  }

  // The staff PIN for redeeming vouchers: made once, kept if the listing is approved again.
  const { data: existingAcc } = await db.from('local_business_accounts').select('redeem_pin').eq('business_id', businessId).maybeSingle()
  const pin = existingAcc?.redeem_pin ?? newPin()
  const { error: accErr } = await db.from('local_business_accounts').upsert({
    redeem_pin: pin,
    business_id: businessId,
    contact_name: app.contact_name,
    contact_email: app.email,
    phone: app.phone,
    billing: app.billing,
    stripe_customer_id: app.stripe_customer_id,
    stripe_subscription_id: app.stripe_subscription_id,
  }, { onConflict: 'business_id' })
  if (accErr) throw new Error(`save contact details: ${accErr.message}`)

  // No card to join (Chris, 26 Nov 2026): approving starts the free month, unless they already pay (or already have a
  // free month running). The daily founding-partners job then sends their results and the "stay on" link before it ends.
  const alreadyPaying = app.payment_status === 'paid'
  const trialEndsAt: string | null = alreadyPaying ? null : (app.trial_ends_at ?? new Date(Date.now() + FOUNDING_TRIAL_DAYS * 86_400_000).toISOString())

  // Welcome email: live link, staff PIN and how vouchers work. A failed email never undoes the approval.
  try {
    await sendAdvertiserWelcome({
      to: app.email, contactName: app.contact_name, businessName: app.business_name, city: app.city, featured: app.package === 'featured', offer: listing.offer_text, pin,
      // Founding partner offer still in its free month: say so (and when it ends) instead of the 12-month term.
      trial: trialEndsAt
        ? { endsOn: new Date(trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' }), monthlyPrice: gbp(FOUNDING_PRICES[app.package === 'featured' ? 'featured' : 'standard']) }
        : null,
    })
  } catch (err) {
    console.error('[advertiser-approve] welcome email failed', err)
  }

  await db.from('advertiser_applications').update({
    status: 'approved', business_id: businessId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...(trialEndsAt ? { payment_status: 'trial', trial_ends_at: trialEndsAt, offer: FOUNDING_OFFER_KEY } : {}),
  }).eq('id', app.id)

  // A "featured partner" Social Pack to tag them in (businesses usually reshare). Draft only; never blocks approval.
  if (businessId) {
    try {
      const draft = buildPartnerDraft({ businessId, name: app.business_name, city: app.city, nearVenue: null, offer: listing.offer_text ?? null })
      await db.from('social_packs').upsert(draft, { onConflict: 'source_type,source_id,city_name', ignoreDuplicates: true })
    } catch (err) {
      console.error('[advertiser-approve] partner social pack failed', err)
    }
  }

  revalidatePath('/admin/advertiser-applications')
  if (businessId) revalidatePath(`/partners/${businessId}`)
  revalidatePath('/admin/local-businesses')
  revalidatePath('/cities/' + encodeURIComponent(app.city))
  // Venue pages cache for a week: rebuild them so a new Featured partner shows on the venues near it.
  revalidatePath('/venues/[slug]', 'page')
}

export async function rejectApplicationAction(applicationId: string) {
  await requireAdmin()
  const db: any = createAdminClient()
  await db.from('advertiser_applications').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', applicationId)
  revalidatePath('/admin/advertiser-applications')
}

// Chris's clear-out for test sign-ups (25 Nov 2026): permanently deletes a REJECTED application that never became a
// listing, with its uploaded files. Approved or published applications can't be deleted here (pause the listing instead).
export async function deleteRejectedApplicationAction(applicationId: string) {
  await requireAdmin()
  const db: any = createAdminClient()
  const { data: app } = await db.from('advertiser_applications').select('id, status, business_id, logo_path, asset_paths').eq('id', applicationId).maybeSingle()
  if (!app || app.status !== 'rejected' || app.business_id) throw new Error('Only rejected applications that never went live can be deleted')
  const files = [app.logo_path, ...(Array.isArray(app.asset_paths) ? app.asset_paths : [])].filter(Boolean)
  if (files.length) await db.storage.from('advertiser-assets').remove(files)
  const { error } = await db.from('advertiser_applications').delete().eq('id', applicationId).eq('status', 'rejected').is('business_id', null)
  if (error) throw new Error(`delete application: ${error.message}`)
  revalidatePath('/admin/advertiser-applications')
}
