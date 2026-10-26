'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { BUSINESS_CATEGORIES, PACKAGES, gbp, type PackageKey } from '@/lib/advertisingPackages'
import { resend, FROM_EMAIL } from '@/lib/resend'

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max)

// A business asks for a listing. It is saved as PENDING (never shown on the site) with private
// contact details; Chris is emailed and sets it live once payment is arranged.
export async function requestListingAction(form: FormData) {
  if (text(form, 'fax', 50)) redirect('/advertise/join?sent=1')   // honeypot: bots fill every field

  const pkg = (text(form, 'package', 20) === 'featured' ? 'featured' : 'standard') as PackageKey
  const billing = text(form, 'billing', 10) === 'yearly' ? 'yearly' : 'monthly'
  const city = CITIES.find(c => c.name.toLowerCase() === text(form, 'city', 60).toLowerCase())?.name
  const categoryValue = text(form, 'category', 20)
  const category = BUSINESS_CATEGORIES.some(([value]) => value === categoryValue) ? categoryValue : 'other'
  const name = text(form, 'name', 80)
  const email = text(form, 'email', 120)
  const contactName = text(form, 'contact_name', 80)
  const description = text(form, 'description', 200)
  const website = text(form, 'website_url', 200)
  const phone = text(form, 'phone', 40)
  const address = text(form, 'address', 160)
  const postcode = text(form, 'postcode', 12).toUpperCase()

  if (!city || !name || !contactName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || form.get('agree') !== 'on') {
    redirect('/advertise/join?error=1')
  }

  const db = createAdminClient()
  const { data: business, error } = await db.from('local_businesses').insert({
    city, name, category, package: pkg, status: 'pending',
    description: description || null, website_url: website || null,
    address: address || null, postcode: postcode || null,
    is_sponsored: pkg === 'featured',
  } as never).select('id').single() as unknown as { data: { id: string } | null; error: { message: string } | null }
  if (error || !business) {
    console.error('[advertise] could not save listing request', error?.message)
    redirect('/advertise/join?error=2')
  }
  await db.from('local_business_accounts').insert({
    business_id: business.id, contact_name: contactName, contact_email: email, phone: phone || null, billing,
  } as never)

  const price = billing === 'yearly' ? `${gbp(PACKAGES[pkg].yearly)} a year` : `${gbp(PACKAGES[pkg].monthly)} a month`
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FROM_EMAIL,
      replyTo: email,
      subject: `New advertiser: ${name} (${city}, ${PACKAGES[pkg].name})`,
      text: [
        `${name} has asked for a ${PACKAGES[pkg].name} in ${city} at ${price}.`,
        '',
        `Contact: ${contactName}, ${email}${phone ? `, ${phone}` : ''}`,
        `Category: ${category}`,
        `Website: ${website || '-'}`,
        `Address: ${[address, postcode].filter(Boolean).join(', ') || '-'}`,
        `Description: ${description || '-'}`,
        '',
        'It is saved as pending (not on the site). Set it live in /admin/local-businesses once payment is arranged.',
      ].join('\n'),
    })
  } catch (err) {
    console.error('[advertise] notification email failed', err)
  }
  redirect('/advertise/join?sent=1')
}
