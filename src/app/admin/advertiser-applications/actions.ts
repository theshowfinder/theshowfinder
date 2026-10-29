'use server'

// Approving a paid advertiser application (the /advertise sign-up and Stripe flow) makes it a live listing:
// the business goes into local_businesses (what the city guide and the "Before the show" box show), the contact and
// Stripe details into local_business_accounts, and the application is marked approved and linked to it.
// Pausing, cancelling and switching package are then done on /admin/local-businesses as for any listing.
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listingCategory } from '@/lib/advertiserCategory'

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

export async function approveApplicationAction(applicationId: string) {
  await requireAdmin()
  const db: any = createAdminClient()
  const { data: app, error } = await db.from('advertiser_applications').select('*').eq('id', applicationId).single()
  if (error || !app) throw new Error(`application not found: ${error?.message ?? applicationId}`)

  const logo_url = await publicLogoUrl(db, app.id, app.logo_path)
  const listing = {
    city: app.city,
    name: app.business_name,
    category: listingCategory(app.category),
    description: app.description,
    website_url: app.website_url,
    package: app.package === 'featured' ? 'featured' : 'standard',
    is_sponsored: app.package === 'featured',
    status: 'active',
    updated_at: new Date().toISOString(),
    ...(logo_url ? { logo_url } : {}),
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

  const { error: accErr } = await db.from('local_business_accounts').upsert({
    business_id: businessId,
    contact_name: app.contact_name,
    contact_email: app.email,
    phone: app.phone,
    billing: app.billing,
    stripe_customer_id: app.stripe_customer_id,
    stripe_subscription_id: app.stripe_subscription_id,
  }, { onConflict: 'business_id' })
  if (accErr) throw new Error(`save contact details: ${accErr.message}`)

  await db.from('advertiser_applications').update({ status: 'approved', business_id: businessId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', app.id)

  revalidatePath('/admin/advertiser-applications')
  revalidatePath('/admin/local-businesses')
  revalidatePath('/cities/' + encodeURIComponent(app.city))
}

export async function rejectApplicationAction(applicationId: string) {
  await requireAdmin()
  const db: any = createAdminClient()
  await db.from('advertiser_applications').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', applicationId)
  revalidatePath('/admin/advertiser-applications')
}
