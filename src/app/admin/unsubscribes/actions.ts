'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseBlockEmails } from '@/lib/emailBlocklist'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const back = (msg: string) => redirect(`/admin/unsubscribes?${new URLSearchParams({ msg }).toString()}`)

/** Block one or more addresses from every list we send to, and mark every existing row for them unsubscribed. */
export async function blockAction(form: FormData) {
  await requireAdmin()
  const emails = parseBlockEmails(String(form.get('emails') ?? ''))
  const reason = String(form.get('reason') ?? '').trim().slice(0, 200) || null
  if (!emails.length) back('No email addresses found in that box.')
  const db = createAdminClient() as Loose
  const now = new Date().toISOString()
  const { error } = await db.from('email_blocklist').upsert(emails.map(email => ({ email, reason })), { onConflict: 'email', ignoreDuplicates: true })
  if (error) back(`Could not save: ${error.message}`)
  let found = 0
  for (const email of emails) {
    const like = email.replace(/[\\%_]/g, '\\$&') // exact match, any letter case
    const hits = await Promise.all([
      db.from('outreach_prospects').update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).ilike('email', like).select('id'),
      db.from('link_prospects').update({ status: 'unsubscribed', updated_at: now }).ilike('email', like).select('id'),
      db.from('organiser_prospects').update({ status: 'unsubscribed' }).ilike('email', like).select('id'),
      db.from('subscribers').update({ unsubscribed_at: now }).ilike('email', like).is('unsubscribed_at', null).select('id'),
    ])
    found += hits.reduce((n: number, r: Loose) => n + (r.data?.length ?? 0), 0)
  }
  revalidatePath('/admin/unsubscribes')
  back(`Blocked ${emails.length} address${emails.length === 1 ? '' : 'es'}. ${found ? `Took ${found} off our lists.` : 'Not on any list yet, and now never will be.'}`)
}

/** Undo a block (added by mistake). Does not re-subscribe anyone. */
export async function unblockAction(form: FormData) {
  await requireAdmin()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (email) await (createAdminClient() as Loose).from('email_blocklist').delete().eq('email', email)
  revalidatePath('/admin/unsubscribes')
  back(`Removed ${email} from the block list.`)
}
