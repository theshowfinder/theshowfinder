'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function loginAction(formData: FormData) {
  const password = formData.get('password') as string
  if (password && password === process.env.ADMIN_PASSWORD) {
    const store = await cookies()
    store.set('admin_token', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    redirect('/admin')
  }
  redirect('/admin/login?error=1')
}

export async function logoutAction() {
  const store = await cookies()
  store.delete('admin_token')
  redirect('/admin/login')
}

async function checkAuth() {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }
}

// ── Artists ──────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80)
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

// Parse bulk paste format: "06 Dec 2026, 19:30, Venue Name, City"
function parseBulkDates(raw: string) {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .flatMap(line => {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 4) return []
      const dateStr    = parts[0]                              // "06 Dec 2026"
      const timeStr    = parts[1]                              // "19:30"
      const city       = parts[parts.length - 1]              // last field
      const venue_name = parts.slice(2, -1).join(', ')        // everything between time and city
      if (!venue_name || !city) return []
      const [day, mon, year] = dateStr.split(' ')
      const month = MONTHS[mon]
      if (!month || !day || !year) return []
      const date = `${year}-${month}-${day.padStart(2, '0')}T${timeStr}:00.000Z`
      return [{ date, venue_name, city }]
    })
}

export async function createArtistAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const name            = (formData.get('name') as string).trim()
  const slug            = ((formData.get('slug') as string) || slugify(name)).trim()
  const image_url       = (formData.get('image_url')       as string) || null
  const description     = (formData.get('description')     as string) || null
  const tour_name       = (formData.get('tour_name')       as string) || null
  const onsale_str      = formData.get('onsale_date') as string
  const onsale_date     = onsale_str ? new Date(onsale_str).toISOString() : null
  const is_featured     = formData.get('is_featured')     === 'on'
  const featured_onsale = formData.get('featured_onsale') === 'on'

  // Ticket URLs — only include if non-empty so missing columns don't cause errors
  const str = (key: string) => (formData.get(key) as string) || null
  const urlFields: Record<string, string | null> = {}
  for (const key of [
    'tickets_url', 'see_tickets_url', 'eventim_url', 'axs_url', 'gigantic_url',
    'gigsberg_url', 'viagogo_url', 'stubhub_url', 'vivid_seats_url',
  ]) {
    const v = str(key)
    if (v) urlFields[key] = v
  }

  const { data: artist, error } = await db
    .from('artists')
    .insert({ name, slug, image_url, description, tour_name, onsale_date, is_featured, featured_onsale, ...urlFields })
    .select('id, slug')
    .single()

  if (error) throw new Error(error.message)

  // Create tour and dates if tour_name provided
  if (tour_name) {
    const { data: tour } = await db
      .from('tours')
      .insert({ artist_id: artist.id, tour_name, onsale_date })
      .select('id')
      .single()

    if (tour) {
      const mode = (formData.get('dates_mode') as string) || 'bulk'
      let rows: { tour_id: string; date: string; venue_name: string; city: string }[] = []

      if (mode === 'bulk') {
        const raw = (formData.get('dates_bulk') as string) || ''
        rows = parseBulkDates(raw).map(r => ({ ...r, tour_id: tour.id }))
      } else {
        const count = parseInt(formData.get('tour_date_count') as string) || 0
        for (let i = 0; i < count; i++) {
          const dateStr = formData.get(`tour_date_${i}_date`)  as string
          const timeStr = (formData.get(`tour_date_${i}_time`) as string) || '19:30'
          const venue   = ((formData.get(`tour_date_${i}_venue`) as string) || '').trim()
          const city    = ((formData.get(`tour_date_${i}_city`)  as string) || '').trim()
          if (dateStr && venue && city) {
            rows.push({
              tour_id: tour.id,
              date: new Date(`${dateStr}T${timeStr}:00`).toISOString(),
              venue_name: venue,
              city,
            })
          }
        }
      }

      if (rows.length) await db.from('tour_dates').insert(rows)
    }
  }

  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/on-sale-this-week')
  revalidatePath('/artists/' + slug)
  redirect('/admin/artists/' + slug + '?created=1')
}

export async function updateArtistAction(id: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const name        = (formData.get('name') as string).trim()
  const slug        = ((formData.get('slug') as string) || slugify(name)).trim()
  const image_url   = (formData.get('image_url') as string) || null
  const description = (formData.get('description') as string) || null
  const tour_name   = (formData.get('tour_name') as string) || null
  const onsale_str  = formData.get('onsale_date') as string
  const onsale_date = onsale_str ? new Date(onsale_str).toISOString() : null
  const tickets_url = (formData.get('tickets_url') as string) || null
  const is_featured = formData.get('is_featured') === 'on'

  const { error } = await db
    .from('artists')
    .update({ name, slug, image_url, description, tour_name, onsale_date, tickets_url, is_featured })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Upsert the tour record (update most-recent tour, or create one)
  if (tour_name) {
    const { data: existing } = await db.from('tours').select('id').eq('artist_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existing) {
      await db.from('tours').update({ tour_name, onsale_date }).eq('id', existing.id)
    } else {
      await db.from('tours').insert({ artist_id: id, tour_name, onsale_date })
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/artists/' + slug)
  revalidatePath('/artists/' + slug)
  redirect('/admin/artists/' + slug + '?saved=1')
}

export async function toggleFeaturedAction(id: string, is_featured: boolean) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('artists').update({ is_featured }).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/')
}

export async function toggleFeaturedOnsaleAction(id: string, featured_onsale: boolean) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('artists').update({ featured_onsale }).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/on-sale-this-week')
}

// ── Tour dates ────────────────────────────────────────────────────────────────

export async function addTourDateAction(tourId: string, artistSlug: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const dateStr    = formData.get('date') as string
  const timeStr    = formData.get('time') as string
  const venue_name = (formData.get('venue_name') as string).trim()
  const city       = (formData.get('city') as string).trim()
  const date       = new Date(`${dateStr}T${timeStr || '19:00'}:00`).toISOString()

  await db.from('tour_dates').insert({ tour_id: tourId, date, venue_name, city })

  revalidatePath('/admin/artists/' + artistSlug)
  revalidatePath('/artists/' + artistSlug)
}

export async function deleteTourDateAction(id: string, artistSlug: string) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('tour_dates').delete().eq('id', id)
  revalidatePath('/admin/artists/' + artistSlug)
  revalidatePath('/artists/' + artistSlug)
}
