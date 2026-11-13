'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// "Looks fine": never raise this listing for this reason again.
export async function markListingFineAction(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('issueId') ?? '')
  if (!id) return
  const db = createAdminClient()
  await db.from('listing_quality_issues').update({ status: 'ok', reviewed_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/listing-check')
}

// "Hide from site": the listing leaves every list, search and artist page.
export async function hideListingAction(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('issueId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  if (!id || !eventId) return
  const db = createAdminClient()
  const { data: issue } = await db.from('listing_quality_issues').select('detail').eq('id', id).maybeSingle()
  await db.from('listing_hides').upsert({ event_id: eventId, reason: `Hidden from listing check: ${issue?.detail ?? ''}`.slice(0, 500), hidden_by: 'admin' }, { onConflict: 'event_id' })
  await db.from('listing_quality_issues').update({ status: 'hidden', reviewed_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/listing-check')
}
