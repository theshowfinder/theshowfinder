'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncGigsbergCatalogue } from '@/lib/gigsbergCatalogue'

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90)
}

async function checkAuth() {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) redirect('/admin/login')
}

export async function runGigsbergCatalogueSyncAction() {
  await requireAdmin()

  try {
    const result = await syncGigsbergCatalogue()
    revalidatePath('/admin/gigsberg')
    redirect(`/admin/gigsberg?synced=${result.fetched}&updated=${result.updated}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The catalogue import failed.'
    redirect(`/admin/gigsberg?syncError=${encodeURIComponent(message)}`)
  }
}

async function getCatalogueRow(id: number) {
  const db = createAdminClient()
  const { data, error } = await db
    .from('gigsberg_catalogue_events')
    .select('id, name, event_date, event_time, venue, city, performer1, url, match_status, matched_event_id')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Gigsberg catalogue record not found')
  return { db, row: data as {
    id: number; name: string; event_date: string; event_time: string | null; venue: string | null
    city: string | null; performer1: string | null; url: string; match_status: string; matched_event_id: string | null
  } }
}

export async function approveExistingGigsbergMatchAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  const eventId = String(formData.get('event_id') ?? '')
  if (!Number.isFinite(catalogueId) || !eventId) throw new Error('Missing Gigsberg or Showfinder event')

  const { db, row } = await getCatalogueRow(catalogueId)
  const { error: eventError } = await db.from('events').update({ gigsberg_affiliate_url: row.url }).eq('id', eventId)
  if (eventError) throw new Error(eventError.message)
  const { error } = await db.from('gigsberg_catalogue_events').update({
    matched_event_id: eventId,
    match_status: 'approved_existing',
    match_reason: 'Approved by admin',
    match_checked_at: new Date().toISOString(),
  }).eq('id', catalogueId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/gigsberg/matches')
  revalidatePath('/events', 'layout')
  redirect('/admin/gigsberg/matches?approved=existing')
}

export async function rejectGigsbergMatchAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  if (!Number.isFinite(catalogueId)) throw new Error('Missing Gigsberg catalogue record')
  const { db } = await getCatalogueRow(catalogueId)
  const { error } = await db.from('gigsberg_catalogue_events').update({
    match_status: 'rejected',
    match_reason: 'Rejected by admin',
    match_checked_at: new Date().toISOString(),
  }).eq('id', catalogueId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/gigsberg/matches')
  redirect('/admin/gigsberg/matches?approved=rejected')
}

export async function createGigsbergEventAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  if (!Number.isFinite(catalogueId)) throw new Error('Missing Gigsberg catalogue record')
  const { db, row } = await getCatalogueRow(catalogueId)
  if (!row.city || !row.venue) throw new Error('A city and venue are required before creating a public event page')

  const venueSlug = slugify(`${row.venue}-${row.city}`)
  const { data: existingVenue } = await db.from('venues').select('id').eq('slug', venueSlug).maybeSingle()
  let venueId = existingVenue?.id as string | undefined
  if (!venueId) {
    const { data: venue, error } = await db.from('venues').insert({
      name: row.venue, slug: venueSlug, address: `${row.venue}, ${row.city}`, postcode: '', city: row.city, country: 'GB',
    }).select('id').single()
    if (error || !venue) throw new Error(error?.message ?? 'Could not create venue')
    venueId = venue.id
  }

  const baseSlug = slugify(`${row.name}-${row.event_date}-${row.city}`)
  const eventSlug = `${baseSlug}-${row.id}`
  const startDate = new Date(`${row.event_date}T${row.event_time || '19:00:00'}Z`).toISOString()
  const { data: event, error: eventError } = await db.from('events').insert({
    title: row.name,
    slug: eventSlug,
    description: `Live event in ${row.city}. Check Gigsberg for current ticket availability.`,
    category: 'concert',
    venue_id: venueId,
    start_date: startDate,
    currency: 'GBP',
    gigsberg_affiliate_url: row.url,
    source: 'gigsberg',
    source_url: row.url,
    status: 'upcoming',
  }).select('id').single()
  if (eventError || !event) throw new Error(eventError?.message ?? 'Could not create Showfinder event')

  if (row.performer1) {
    const artistSlug = slugify(row.performer1)
    const { data: existingArtist } = await db.from('artists').select('id').eq('slug', artistSlug).maybeSingle()
    const artistId = existingArtist?.id as string | undefined
    const finalArtistId = artistId ?? (await db.from('artists').insert({ name: row.performer1, slug: artistSlug }).select('id').single()).data?.id
    if (finalArtistId) await db.from('event_artists').insert({ event_id: event.id, artist_id: finalArtistId, is_headliner: true, order: 0 })
  }

  const { error } = await db.from('gigsberg_catalogue_events').update({
    matched_event_id: event.id,
    match_status: 'approved_new',
    match_reason: 'New Showfinder page created by admin',
    match_checked_at: new Date().toISOString(),
  }).eq('id', catalogueId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/gigsberg/matches')
  revalidatePath('/events', 'layout')
  revalidatePath('/cities', 'layout')
  redirect(`/admin/gigsberg/matches?approved=new&event=${encodeURIComponent(eventSlug)}`)
}
