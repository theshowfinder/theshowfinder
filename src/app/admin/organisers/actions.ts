'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const STATUSES = ['new', 'approved', 'contacted', 'followed_up', 'replied', 'listed', 'not_interested', 'unsubscribed', 'bounced']

export async function setOrganiserStatusAction(form: FormData) {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) redirect('/admin/login')
  const id = String(form.get('id') ?? '')
  const status = String(form.get('status') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !STATUSES.includes(status)) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).from('organiser_prospects').update({ status }).eq('id', id)
  revalidatePath('/admin/organisers')
}

/** Approve ticked organisers (or every new one with an email) for ticket-selling outreach. */
export async function approveOrganisersAction(form: FormData) {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) redirect('/admin/login')
  const ids = form.getAll('id').map(String).filter(id => /^[0-9a-f-]{36}$/.test(id))
  const all = String(form.get('all') ?? '') === '1'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (createAdminClient() as any).from('organiser_prospects').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('status', 'new').not('email', 'is', null)
  if (!all) q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  await q
  revalidatePath('/admin/organisers')
  redirect('/admin/organisers?route=email&status=approved')
}
