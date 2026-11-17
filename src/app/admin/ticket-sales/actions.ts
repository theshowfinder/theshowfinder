'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundOrder } from '@/lib/ticketPayments'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

export async function refundOrderAction(form: FormData) {
  await requireAdmin()
  const id = String(form.get('id') ?? '')
  const event = String(form.get('event') ?? '')
  const reason = String(form.get('reason') ?? '').trim().slice(0, 200)
  let msg = 'Refunded.'
  try { await refundOrder(createAdminClient(), id, reason) } catch (err) { msg = `Refund failed: ${err instanceof Error ? err.message : String(err)}` }
  revalidatePath('/admin/ticket-sales')
  redirect(`/admin/ticket-sales?event=${encodeURIComponent(event)}&msg=${encodeURIComponent(msg)}`)
}

/** Event cancelled: refund every ticket holder in full and mark the event cancelled. */
export async function refundEventAction(form: FormData) {
  await requireAdmin()
  const event = String(form.get('event') ?? '')
  if (String(form.get('confirm') ?? '') !== 'REFUND') redirect(`/admin/ticket-sales?event=${encodeURIComponent(event)}&msg=${encodeURIComponent('Type REFUND to confirm.')}`)
  const db = createAdminClient() as Loose
  const { data: orders } = await db.from('ticket_orders').select('id').eq('event_id', event).eq('status', 'confirmed')
  let ok = 0, failed = 0
  for (const o of (orders ?? []) as Array<{ id: string }>) {
    try { await refundOrder(db, o.id, 'The event has been cancelled.'); ok++ } catch { failed++ }
  }
  if (!failed) await db.from('events').update({ status: 'cancelled' }).eq('id', event)
  revalidatePath('/admin/ticket-sales')
  redirect(`/admin/ticket-sales?event=${encodeURIComponent(event)}&msg=${encodeURIComponent(`Refunded ${ok} order${ok === 1 ? '' : 's'}${failed ? `, ${failed} failed (event not marked cancelled)` : ', event marked cancelled'}.`)}`)
}
