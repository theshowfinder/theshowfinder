'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const STATUSES = ['new', 'contacted', 'replied', 'listed', 'not_interested', 'unsubscribed']

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
