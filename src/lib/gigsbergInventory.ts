// Automatic Gigsberg inventory check.
//
// "Tickets available on Gigsberg" used to be set only when someone pressed the manual
// check button in the admin, so only the few shows reviewed by hand (all in Derby)
// ever had a status, and /gigsberg could only list those. This checks the shows that are
// already matched to a Gigsberg listing (auto-matched or admin-approved), a batch per run,
// oldest check first, so every matched show is re-checked every few days.
//
// It only writes inventory_status / inventory_checked_at. It does not touch the catalogue
// import, the matching, affiliate URLs, highlights or any source id.

import { createAdminClient } from '@/lib/supabase/admin'
import { searchGigsbergAffiliateListings } from '@/lib/gigsbergAffiliate'

export type InventoryStatus = 'available' | 'no_inventory' | 'check_failed'

export function inventoryStatusFromTotal(total: number | null | undefined): InventoryStatus {
  return (total ?? 0) > 0 ? 'available' : 'no_inventory'
}

export const MATCHED_STATUSES = ['auto_matched', 'approved_existing', 'approved_new'] as const

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface InventoryBatchResult {
  checked: number
  available: number
  noInventory: number
  failed: number
}

export async function checkGigsbergInventoryBatch(
  { limit = 150, concurrency = 4, gapMs = 150 }: { limit?: number; concurrency?: number; gapMs?: number } = {},
): Promise<InventoryBatchResult> {
  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await db
    .from('gigsberg_catalogue_events')
    .select('id, matched_event_id')
    .in('match_status', [...MATCHED_STATUSES])
    .not('matched_event_id', 'is', null)
    .gte('event_date', today)
    .order('inventory_checked_at', { ascending: true, nullsFirst: true })
    .order('event_date', { ascending: true })
    .limit(limit) as unknown as { data: { id: number; matched_event_id: string }[] | null; error: { message: string } | null }
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const result: InventoryBatchResult = { checked: 0, available: 0, noInventory: 0, failed: 0 }

  for (let i = 0; i < rows.length; i += concurrency) {
    await Promise.all(rows.slice(i, i + concurrency).map(async row => {
      const checkedAt = new Date().toISOString()
      let status: InventoryStatus
      try {
        const res = await searchGigsbergAffiliateListings({ event_id: row.id, currency_code: 'GBP' })
        status = inventoryStatusFromTotal(res.total)
      } catch (err) {
        console.error('[gigsberg-inventory] check failed for', row.id, err instanceof Error ? err.message : err)
        status = 'check_failed'
      }

      result.checked++
      if (status === 'available') result.available++
      else if (status === 'no_inventory') result.noInventory++
      else result.failed++

      // Record the attempt on the catalogue row either way (so a failing row moves to the back
      // of the queue). The event keeps its last good status when the check itself failed.
      await db.from('gigsberg_catalogue_events')
        .update({ inventory_status: status, inventory_checked_at: checkedAt })
        .eq('id', row.id)
      if (status !== 'check_failed') {
        await db.from('events')
          .update({ gigsberg_inventory_status: status, gigsberg_inventory_checked_at: checkedAt })
          .eq('id', row.matched_event_id)
      }
    }))
    if (i + concurrency < rows.length) await sleep(gapMs)
  }
  return result
}
