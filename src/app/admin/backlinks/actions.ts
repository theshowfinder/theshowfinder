'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { domainOf } from '@/lib/linkOutreach'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as Loose
const back = (msg: string, status = 'ready') => redirect(`/admin/backlinks?${new URLSearchParams({ msg, status }).toString()}`)
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/** Approve the ticked drafts (or every ready draft): the sender sends them in office hours, plus one follow-up. */
export async function approveAction(form: FormData) {
  await requireAdmin()
  const ids = form.getAll('id').map(String).filter(id => /^[0-9a-f-]{36}$/.test(id))
  const all = str(form, 'all') === '1'
  if (!all && !ids.length) back('Tick at least one email to approve.')
  const now = new Date().toISOString()
  let q = db().from('link_prospects').update({ status: 'approved', approved_at: now, updated_at: now }).eq('status', 'ready')
  if (!all) q = q.in('id', ids)
  const { data } = await q.select('id')
  revalidatePath('/admin/backlinks')
  back(`Approved ${data?.length ?? 0}. They go out on weekdays 9am to 5pm, up to 25 a day.`)
}

export async function setLinkStatusAction(form: FormData) {
  await requireAdmin()
  const id = str(form, 'id'), status = str(form, 'status'), from = str(form, 'from') || 'ready'
  if (!['skipped', 'replied', 'linked', 'declined', 'ready', 'unsubscribed'].includes(status)) back('Unknown status.', from)
  const now = new Date().toISOString()
  await db().from('link_prospects').update({
    status, updated_at: now, ...(status === 'replied' ? { replied_at: now } : {}), ...(status === 'linked' ? { linked_at: now, link_url: str(form, 'link_url') || null } : {}),
  }).eq('id', id)
  revalidatePath('/admin/backlinks')
  back('Updated.', from)
}

/** Add a contact by hand (a found email for a "no email" venue, or a press contact with its own pitch). */
export async function addLinkContactAction(form: FormData) {
  await requireAdmin()
  const email = str(form, 'email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('That email address doesn’t look right.', 'ready')
  const id = str(form, 'id')
  const now = new Date().toISOString()
  if (id) {
    await db().from('link_prospects').update({ email, contact_name: str(form, 'contact_name') || null, status: 'ready', updated_at: now }).eq('id', id)
    back('Email added: the draft is ready to approve.')
  }
  const kind = ['venue', 'organiser', 'press'].includes(str(form, 'kind')) ? str(form, 'kind') : 'press'
  const website = str(form, 'website') || null
  const { error } = await db().from('link_prospects').insert({
    kind, name: str(form, 'name') || email, city: str(form, 'city') || null, email, contact_name: str(form, 'contact_name') || null,
    website, domain: domainOf(website), pitch: kind === 'press' ? 'data' : kind === 'venue' ? 'widget' : 'listings',
    subject: str(form, 'subject') || null, body: str(form, 'body') || null, status: 'ready',
  })
  back(error ? `Couldn’t add it: ${error.message}` : 'Added: the draft is ready to approve.')
}
