'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createEventFromCatalogue } from '@/lib/feedEventImport'

async function checkAuth() {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) redirect('/admin/login')
}

type Platform = 'gigsberg' | 'see_tickets'
const TABLE: Record<Platform, string> = { gigsberg: 'gigsberg_catalogue_events', see_tickets: 'see_tickets_catalogue_events' }

function parse(formData: FormData) {
  const platform = String(formData.get('platform') ?? '') as Platform
  if (platform !== 'gigsberg' && platform !== 'see_tickets') throw new Error('Unknown platform')
  const id = String(formData.get('catalogue_id') ?? '')
  if (!id) throw new Error('Missing catalogue record')
  return { platform, id }
}

/** Link one platform listing to one site event: puts the platform's button on that event and records the link. */
export async function linkAction(formData: FormData) {
  await checkAuth()
  const { platform, id } = parse(formData)
  const eventId = String(formData.get('event_id') ?? '')
  if (!eventId) throw new Error('Missing site event')
  const db = createAdminClient()
  const table = TABLE[platform]

  const { data: row, error: rowErr } = await db.from(table as never).select('*').eq('id', id as never).maybeSingle() as unknown as { data: { url: string; inventory_status?: string } | null; error: { message: string } | null }
  if (rowErr || !row) throw new Error(rowErr?.message ?? 'Catalogue record not found')
  const { data: event, error: evErr } = await db.from('events').select('id, slug').eq('id', eventId).maybeSingle()
  if (evErr || !event) throw new Error(evErr?.message ?? 'Site event not found')

  const eventPatch = platform === 'gigsberg'
    ? { gigsberg_affiliate_url: row.url, gigsberg_inventory_status: row.inventory_status ?? 'unknown' }
    : { see_tickets_affiliate_url: row.url }
  const { error: upErr } = await db.from('events').update(eventPatch as never).eq('id', eventId)
  if (upErr) throw new Error(upErr.message)

  const { error: catErr } = await db.from(table as never).update({
    matched_event_id: eventId,
    match_status: 'approved_existing',
    match_confidence: null,
    match_reason: 'Manually linked from the Unmatched worklist',
    match_checked_at: new Date().toISOString(),
  } as never).eq('id', id as never)
  if (catErr) throw new Error(catErr.message)

  revalidatePath('/admin/unmatched')
  revalidatePath(`/events/${event.slug}`)
}

/** "These are not on our site and never will be" (or "not a match to anything"): hides the row from the worklist. */
export async function hideAction(formData: FormData) {
  await checkAuth()
  const { platform, id } = parse(formData)
  const { error } = await createAdminClient().from(TABLE[platform] as never).update({
    match_status: 'rejected',
    match_reason: 'Hidden from the Unmatched worklist by admin',
    match_checked_at: new Date().toISOString(),
  } as never).eq('id', id as never)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/unmatched')
}

/** Undo a hide: put the row back in the worklist. */
export async function unhideAction(formData: FormData) {
  await checkAuth()
  const { platform, id } = parse(formData)
  const { error } = await createAdminClient().from(TABLE[platform] as never).update({
    match_status: 'pending',
    match_reason: 'Restored to the Unmatched worklist by admin',
  } as never).eq('id', id as never)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/unmatched')
}

/** "This show is not on the site": build its event page from the feed (venue + city from the feed, ticket check for Gigsberg). */
export async function createEventAction(formData: FormData) {
  await checkAuth()
  const { platform, id } = parse(formData)
  const back = String(formData.get('return_to') ?? '/admin/unmatched')
  const base = back.startsWith('/admin/unmatched') ? back : '/admin/unmatched'
  const res = await createEventFromCatalogue(platform, id)
  revalidatePath('/admin/unmatched')
  revalidatePath('/admin/feeds')
  const sep = base.includes('?') ? '&' : '?'
  redirect(`${base}${sep}msg=${encodeURIComponent(res.ok ? `Created the event page${res.slug ? `: /events/${res.slug}` : ''}` : `Not created: ${res.error}`)}&ok=${res.ok ? 1 : 0}`)
}
