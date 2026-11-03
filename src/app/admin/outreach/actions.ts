'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'

async function checkAuth() {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) redirect('/admin/login')
}
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as Loose
const back = (msg: string, ok = true, status = '') =>
  redirect(`/admin/outreach?${new URLSearchParams({ msg, ok: ok ? '1' : '0', ...(status ? { status } : {}) }).toString()}`)
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

const COMPANY_TYPES = ['ltd', 'sole_trader', 'partnership', 'unknown', 'consented']

export async function addProspectAction(form: FormData) {
  await checkAuth()
  const email = str(form, 'email').toLowerCase()
  const city = CITIES.find(c => c.name.toLowerCase() === str(form, 'city').toLowerCase())?.name
  if (!str(form, 'business_name') || !/^\S+@\S+\.\S+$/.test(email) || !city) back('Business name, a valid email and one of our cities are needed.', false)
  const companyType = COMPANY_TYPES.includes(str(form, 'company_type')) ? str(form, 'company_type') : 'unknown'
  const { error } = await db().from('outreach_prospects').insert({
    business_name: str(form, 'business_name'), contact_name: str(form, 'contact_name') || null, category: str(form, 'category') || 'Restaurant', city,
    near_venue: str(form, 'near_venue') || null, distance_label: str(form, 'distance_label') || null, email,
    website: str(form, 'website') || null, address: str(form, 'address') || null, company_type: companyType,
    company_number: str(form, 'company_number') || null, notes: str(form, 'notes') || null,
  })
  revalidatePath('/admin/outreach')
  back(error ? (/duplicate/.test(error.message) ? 'That email is already on the list.' : error.message) : 'Added. Check it, then tick it to send.', !error)
}

/** Tick → approved for sending. Only limited companies (or businesses that said yes) can be approved. */
export async function approveSelectedAction(form: FormData) {
  await checkAuth()
  const ids = form.getAll('id').map(String).filter(Boolean)
  if (!ids.length) back('Tick at least one business first.', false)
  const { data } = await db().from('outreach_prospects').update({ status: 'approved', updated_at: new Date().toISOString() })
    .in('id', ids).eq('status', 'to_check').in('company_type', ['ltd', 'consented']).select('id')
  revalidatePath('/admin/outreach')
  const n = data?.length ?? 0
  back(`${n} approved for sending.${n < ids.length ? ` ${ids.length - n} skipped (not a limited company, or already handled).` : ''}`, n > 0)
}

export async function setStatusAction(id: string, status: string) {
  await checkAuth()
  const allowed = ['to_check', 'replied', 'interested', 'onboarding', 'won', 'no_response', 'not_interested', 'unsubscribed', 'bounced']
  if (!allowed.includes(status)) back('Unknown status.', false)
  const now = new Date().toISOString()
  await db().from('outreach_prospects').update({ status, updated_at: now, ...(status === 'replied' ? { replied_at: now } : {}), ...(status === 'unsubscribed' ? { unsubscribed_at: now } : {}) }).eq('id', id)
  revalidatePath('/admin/outreach')
  back('Updated.')
}

export async function setCompanyTypeAction(id: string, form: FormData) {
  await checkAuth()
  const t = str(form, 'company_type')
  if (!COMPANY_TYPES.includes(t)) back('Unknown company type.', false)
  await db().from('outreach_prospects').update({ company_type: t, company_number: str(form, 'company_number') || null, updated_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/outreach')
  back('Company type saved.')
}

export async function deleteProspectAction(id: string) {
  await checkAuth()
  await db().from('outreach_prospects').delete().eq('id', id).in('status', ['to_check', 'approved'])
  revalidatePath('/admin/outreach')
  back('Removed (only businesses not yet emailed can be removed; emailed ones stay as a record).')
}
