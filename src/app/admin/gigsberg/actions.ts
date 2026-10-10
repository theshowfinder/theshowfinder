'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncGigsbergCatalogue } from '@/lib/gigsbergCatalogue'
import { CITIES } from '@/lib/cities'
import { searchGigsbergAffiliateListings } from '@/lib/gigsbergAffiliate'

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
    redirect(`/admin/gigsberg?synced=${result.fetched}&updated=${result.updated}&importCity=${encodeURIComponent(result.city)}&nextCity=${encodeURIComponent(result.nextCity ?? '')}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The catalogue import failed.'
    redirect(`/admin/gigsberg?syncError=${encodeURIComponent(message)}`)
  }
}

export async function manualGigsbergCityImportAction(formData: FormData) {
  await requireAdmin()
  const city = String(formData.get('city') ?? '').trim()
  const from = String(formData.get('from') ?? '').trim()
  const to = String(formData.get('to') ?? '').trim()
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T23:59:59Z`).getTime()
  const maxWindow = 730 * 24 * 60 * 60 * 1000
  if (!CITIES.some(item => item.name === city) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > maxWindow) {
    redirect('/admin/gigsberg?manualError=Choose a UK city and a valid date range of no more than 24 months.')
  }
  let result
  try {
    result = await syncGigsbergCatalogue(city, from, to)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The manual Gigsberg import failed.'
    redirect(`/admin/gigsberg?manualError=${encodeURIComponent(message)}`)
  }
  revalidatePath('/admin/gigsberg')
  revalidatePath(`/admin/gigsberg/coverage?city=${encodeURIComponent(city)}`)
  redirect(`/admin/gigsberg?manualCity=${encodeURIComponent(city)}&manualFrom=${from}&manualTo=${to}&manualFetched=${result.fetched}&manualSaved=${result.updated}&manualErrors=${result.errors}`)
}

async function getCatalogueRow(id: number) {
  const db = createAdminClient()
  const { data, error } = await db
    .from('gigsberg_catalogue_events')
    .select('id, name, event_date, event_time, venue, city, performer1, url, match_status, matched_event_id, inventory_status')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Gigsberg catalogue record not found')
  return { db, row: data as {
    id: number; name: string; event_date: string; event_time: string | null; venue: string | null
    city: string | null; performer1: string | null; url: string; match_status: string; matched_event_id: string | null; inventory_status: string
  } }
}

export async function approveExistingGigsbergMatchAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  const eventId = String(formData.get('event_id') ?? '')
  const requestedHighlight = formData.get('highlight') === '1'
  if (!Number.isFinite(catalogueId) || !eventId) throw new Error('Missing Gigsberg or Showfinder event')

  const { db, row } = await getCatalogueRow(catalogueId)
  let highlight = requestedHighlight && row.inventory_status === 'available'
  const { error: eventError } = await db.from('events').update({
    gigsberg_affiliate_url: row.url,
    gigsberg_highlighted: highlight,
    gigsberg_highlight_until: highlight ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null,
  }).eq('id', eventId)
  if (eventError) throw new Error(eventError.message)
  const { error } = await db.from('gigsberg_catalogue_events').update({
    matched_event_id: eventId,
    match_status: 'approved_existing',
    match_reason: highlight ? 'Approved and highlighted by admin' : 'Approved by admin',
    match_checked_at: new Date().toISOString(),
  }).eq('id', catalogueId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/gigsberg/matches')
  revalidatePath('/events', 'layout')
  redirect('/admin/gigsberg/matches?approved=existing')
}

export async function checkGigsbergInventoryAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  if (!Number.isFinite(catalogueId)) throw new Error('Missing Gigsberg catalogue record')
  const { db, row } = await getCatalogueRow(catalogueId)
  let inventoryStatus = 'check_failed'
  try {
    const result = await searchGigsbergAffiliateListings({ event_id: row.id, currency_code: 'GBP' })
    inventoryStatus = result.total > 0 ? 'available' : 'no_inventory'
  } catch (error) {
    console.error('[gigsberg] inventory check failed', error)
  }
  const checkedAt = new Date().toISOString()
  const { error } = await db.from('gigsberg_catalogue_events').update({ inventory_status: inventoryStatus, inventory_checked_at: checkedAt }).eq('id', catalogueId)
  if (error) throw new Error(error.message)
  if (row.matched_event_id) await db.from('events').update({ gigsberg_inventory_status: inventoryStatus, gigsberg_inventory_checked_at: checkedAt }).eq('id', row.matched_event_id)
  revalidatePath('/admin/gigsberg/matches')
  revalidatePath('/admin/gigsberg/coverage')
  const returnTo = String(formData.get('return_to') ?? '')
  const anchor = String(formData.get('return_anchor') ?? '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (returnTo.startsWith('/admin/gigsberg/')) {
    const [path, hash] = returnTo.split('#', 2)
    redirect(`${path}${path.includes('?') ? '&' : '?'}inventory=${inventoryStatus}#${anchor || hash || ''}`)
  }
  redirect(`/admin/gigsberg/matches?inventory=${inventoryStatus}`)
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

export async function linkGigsbergToExistingEventAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  const eventId = String(formData.get('event_id') ?? '')
  if (!Number.isFinite(catalogueId) || !eventId) throw new Error('Missing Gigsberg or Showfinder event')

  const { db, row } = await getCatalogueRow(catalogueId)
  const { data: event, error: eventLookupError } = await db
    .from('events')
    .select('id, start_date')
    .eq('id', eventId)
    .maybeSingle()
  if (eventLookupError || !event) throw new Error(eventLookupError?.message ?? 'Showfinder event not found')

  const { error: eventError } = await db.from('events').update({
    gigsberg_affiliate_url: row.url,
    gigsberg_inventory_status: row.inventory_status,
  }).eq('id', eventId)
  if (eventError) throw new Error(eventError.message)

  const { error } = await db.from('gigsberg_catalogue_events').update({
    matched_event_id: eventId,
    match_status: 'approved_existing',
    match_confidence: null,
    match_reason: 'Manually linked to an existing Showfinder event',
    match_checked_at: new Date().toISOString(),
  }).eq('id', catalogueId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/gigsberg/matches')
  revalidatePath('/admin/gigsberg/link')
  revalidatePath('/admin/gigsberg/coverage')
  revalidatePath('/events', 'layout')
  const returnTo = String(formData.get('return_to') ?? '')
  if (returnTo.startsWith('/admin/gigsberg/')) redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}linked=1`)
  redirect(`/admin/gigsberg/coverage?city=${encodeURIComponent(row.city ?? '')}&linked=1`)
}

export async function createGigsbergEventAction(formData: FormData) {
  await checkAuth()
  const catalogueId = Number(formData.get('catalogue_id'))
  const requestedHighlight = formData.get('highlight') === '1'
  if (!Number.isFinite(catalogueId)) throw new Error('Missing Gigsberg catalogue record')
  const { db, row } = await getCatalogueRow(catalogueId)
  let highlight = requestedHighlight && row.inventory_status === 'available'
  if (!row.city || !row.venue) throw new Error('A city and venue are required before creating a public event page')

  // Re-check immediately before publishing a Gigsberg-only page. Catalogue
  // URLs can become stale when an event sells out or is delisted between the
  // import and manual review; never create a page with a dead ticket route.
  let liveStatus = 'check_failed'
  try {
    const liveInventory = await searchGigsbergAffiliateListings({ event_id: row.id, currency_code: 'GBP' })
    const checkedAt = new Date().toISOString()
    liveStatus = liveInventory.total > 0 ? 'available' : 'no_inventory'
    await db.from('gigsberg_catalogue_events').update({ inventory_status: liveStatus, inventory_checked_at: checkedAt }).eq('id', catalogueId)
  } catch (error) {
    console.error('[gigsberg] live inventory check before page creation failed', error)
    redirect('/admin/gigsberg/matches?inventory=check_failed')
  }
  if (liveStatus !== 'available') redirect('/admin/gigsberg/matches?inventory=no_inventory')
  highlight = requestedHighlight

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
    gigsberg_highlighted: highlight,
    gigsberg_highlight_until: highlight ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null,
    gigsberg_inventory_status: 'available',
    source: 'gigsberg',
    source_url: row.url,
    status: 'upcoming',
  }).select('id').single()
  if (eventError || !event) throw new Error(eventError?.message ?? 'Could not create Showfinder event')

  let artistImageUrl: string | null = null
  if (row.performer1) {
    const artistSlug = slugify(row.performer1)
    const { data: existingArtist } = await db.from('artists').select('id, image_url').eq('slug', artistSlug).maybeSingle()
    const artistId = existingArtist?.id as string | undefined
    artistImageUrl = (existingArtist?.image_url as string | null | undefined) ?? null
    const finalArtistId = artistId ?? (await db.from('artists').insert({ name: row.performer1, slug: artistSlug }).select('id').single()).data?.id
    if (finalArtistId) await db.from('event_artists').insert({ event_id: event.id, artist_id: finalArtistId, is_headliner: true, order: 0 })
  }

  const { error: imageError } = await db.from('events').update({
    // Reuse an approved artist image when one exists. Otherwise use the
    // site's branded fallback; no third-party image is scraped from Gigsberg.
    image_url: artistImageUrl ?? 'https://www.theshowfinder.com/og-image.png',
  }).eq('id', event.id)
  if (imageError) throw new Error(imageError.message)

  const { error } = await db.from('gigsberg_catalogue_events').update({
    matched_event_id: event.id,
    match_status: 'approved_new',
    match_reason: 'New Showfinder page created by admin',
    match_checked_at: new Date().toISOString(),
    image_status: artistImageUrl ? 'artist_image' : 'branded_fallback',
  }).eq('id', catalogueId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/gigsberg/matches')
  revalidatePath('/events', 'layout')
  revalidatePath('/cities', 'layout')
  const returnTo = String(formData.get('return_to') ?? '')
  if (returnTo.startsWith('/admin/gigsberg/')) redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}created=1`)
  redirect(`/admin/gigsberg/coverage?city=${encodeURIComponent(row.city)}&created=1&event=${encodeURIComponent(eventSlug)}`)
}
