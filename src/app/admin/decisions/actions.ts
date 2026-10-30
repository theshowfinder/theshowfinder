'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeEventsInto } from '@/lib/venueFamilyMerge'
import { revalidateEventPages } from '@/lib/changedPages'

async function checkAuth() {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) redirect('/admin/login')
}

const back = (msg: string, ok: boolean, page: string) =>
  redirect(`/admin/decisions?${new URLSearchParams({ msg, ok: ok ? '1' : '0', ...(page && page !== '1' ? { page } : {}) }).toString()}`)

/** Same show: keep one event, merge every other event in the group into it. */
export async function mergeGroupAction(formData: FormData) {
  await checkAuth()
  const reviewId = String(formData.get('review_id') ?? '')
  const keepId = String(formData.get('keep_id') ?? '')
  const page = String(formData.get('page') ?? '')
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: review } = await db.from('event_merge_reviews').select('id, event_ids').eq('id', reviewId).maybeSingle()
  if (!review || !keepId) back('That decision is no longer open.', false, page)
  let message = ''
  let ok = true
  try {
    // The listing grouping (refresh_event_canonical) catches up on the next refresh-listings run; running it here
    // made every click wait for a whole-table rebuild.
    const { merged, clashes } = await mergeEventsInto(keepId, (review.event_ids as string[]).filter(id => id !== keepId), { refreshCanonical: false })
    await db.from('event_merge_reviews').update({ status: 'merged', decided_at: new Date().toISOString(), suggested_keep_id: keepId }).eq('id', reviewId)
    message = `Merged ${merged} listing${merged === 1 ? '' : 's'} into the one you kept.${clashes.length ? ` Note: ${clashes.join('; ')}` : ''}`
  } catch (e) {
    ok = false
    message = `Could not merge: ${e instanceof Error ? e.message : String(e)}`
  }
  revalidatePath('/admin/decisions')
  await revalidateEventPages(db, (review?.event_ids as string[] | undefined) ?? [])
  back(message, ok, page)
}

/** Not the same show (or, for a lone extra, leave it listed): the nightly job never raises this group again. */
export async function notSameAction(formData: FormData) {
  await checkAuth()
  const reviewId = String(formData.get('review_id') ?? '')
  const page = String(formData.get('page') ?? '')
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
  await db.from('event_merge_reviews').update({ status: 'not_duplicate', decided_at: new Date().toISOString() }).eq('id', reviewId)
  revalidatePath('/admin/decisions')
  back('Kept them as separate listings. This group will not come back.', true, page)
}
