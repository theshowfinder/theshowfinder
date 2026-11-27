'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { parseImport, hostOf } from '@/lib/outreachImport'
import { xlsxSheets } from '@/lib/xlsxRows'
import { looksLikeChain } from '@/lib/outreach'
import { fetchAllPages } from '@/lib/pagedFetch'

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

/** Restart outreach after the automatic brake paused it (spam complaint, bounces, or a Zoho refusal). */
export async function resumeOutreachAction() {
  await checkAuth()
  await db().from('outreach_settings').update({ resend_paused_until: null, zoho_paused_until: null, pause_reason: null, updated_at: new Date().toISOString() }).eq('id', 1)
  revalidatePath('/admin/outreach')
  back('Outreach resumed: the next morning runs will send again.')
}

/** Spreadsheet import (26 Nov 2026): businesses found by hand go into the finder's queue, ahead of the map ones. The
 *  finder reads each website for the email and runs the usual checks; nothing is emailed straight from the sheet. */
export async function importBusinessesAction(form: FormData) {
  await checkAuth()
  // A whole spreadsheet file (.xlsx or .csv), or rows pasted from one. For a workbook, the tab with the most usable
  // rows is used (so a "Read Me" tab in front doesn't matter).
  const cityNames = CITIES.map(c => c.name)
  const file = form.get('file')
  let parsed = parseImport(str(form, 'rows'), cityNames)
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer())
    if (/\.xlsx$/i.test(file.name)) {
      let sheets: ReturnType<typeof xlsxSheets> = []
      try { sheets = xlsxSheets(buf) } catch { back('That file could not be read as an Excel (.xlsx) file. Try saving it as .xlsx or .csv again.', false) }
      parsed = sheets.map(sh => parseImport(sh.rows.map(r => r.map(c => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'), cityNames))
        .sort((a, b) => b.rows.length - a.rows.length)[0] ?? parsed
    } else if (/\.(csv|tsv|txt)$/i.test(file.name)) {
      parsed = parseImport(buf.toString('utf8').replace(/^\uFEFF/, ''), cityNames)
    } else back('Please upload an .xlsx or .csv file (Excel and Google Sheets can both save these).', false)
  }
  const { rows, skipped } = parsed
  if (!rows.length) back(`Nothing to import.${skipped.length ? ` Skipped: ${skipped.slice(0, 5).join('; ')}` : ' Paste rows with Business, Website and City.'}`, false)
  const [prospects, candidates, scanned] = await Promise.all([
    fetchAllPages<{ website: string | null }>((from, to) => db().from('outreach_prospects').select('website').order('id').range(from, to)),
    fetchAllPages<{ website: string }>((from, to) => db().from('outreach_candidates').select('website').order('key').range(from, to)),
    fetchAllPages<{ website_host: string | null }>((from, to) => db().from('outreach_scanned').select('website_host').order('key').range(from, to)),
  ])
  const known = new Set<string>([...prospects.map(p => hostOf(p.website ?? '')), ...candidates.map(c => hostOf(c.website)), ...scanned.map(s => s.website_host ?? '')].filter(Boolean))
  const amenity = (cat: string | null) => {
    const c = (cat ?? '').toLowerCase()
    return /hotel|b&b|guest/.test(c) ? { tourism: 'hotel' } : /pub/.test(c) ? { amenity: 'pub' } : /bar|cocktail|wine/.test(c) ? { amenity: 'bar' } : /caf|coffee|bakery|tea/.test(c) ? { amenity: 'cafe' } : { amenity: 'restaurant' }
  }
  const fresh = rows.filter(r => !known.has(hostOf(r.website)))
  const insert = fresh.map(r => ({
    key: `import:${hostOf(r.website)}`, city: r.city, name: r.name, website: r.website, lat: null, lng: null, venue: r.venue, metres: null,
    chain: looksLikeChain({ name: r.name, website: r.website, email: r.email }),
    tags: { source: 'import', ...amenity(r.category), ...(r.email ? { email: r.email } : {}) },
  }))
  for (let i = 0; i < insert.length; i += 200) {
    const { error } = await db().from('outreach_candidates').upsert(insert.slice(i, i + 200), { onConflict: 'key', ignoreDuplicates: true })
    if (error) back(`Import failed: ${error.message}`, false)
  }
  revalidatePath('/admin/outreach')
  const dupes = rows.length - fresh.length
  back(`Imported ${fresh.length} business${fresh.length === 1 ? '' : 'es'} into the finder's queue: they're checked over the next few runs and appear under "Ready to check" or "Approved".${dupes ? ` ${dupes} already known.` : ''}${skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 4).join('; ')}${skipped.length > 4 ? '…' : ''}` : ''}`)
}
