/**
 * Seed script: insert Donny Osmond artist + tour + 12 UK dates
 * Run: npx tsx scripts/seed-donny-osmond.ts
 */

import * as fs from 'fs'
import * as path from 'path'

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim()
  }
}

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TM_KEY = process.env.TICKETMASTER_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchTMImage(artistName: string): Promise<string | null> {
  if (!TM_KEY) { console.warn('No TM_API_KEY — skipping image fetch'); return null }
  const url = `https://app.ticketmaster.com/discovery/v2/attractions.json?keyword=${encodeURIComponent(artistName)}&classificationName=music&apikey=${TM_KEY}`
  const res = await fetch(url)
  if (!res.ok) { console.warn('TM API error:', res.status); return null }
  const json = await res.json() as { _embedded?: { attractions?: Array<{ images?: Array<{ url: string; width: number }> }> } }
  const attractions = json._embedded?.attractions ?? []
  if (!attractions.length) return null
  const images = attractions[0].images ?? []
  // Prefer 16:9 tablet landscape images
  const preferred = images.find(i => i.url.includes('TABLET_LANDSCAPE_16_9') && !i.url.includes('LARGE'))
  const fallback = images.sort((a, b) => b.width - a.width)[0]
  return (preferred ?? fallback)?.url ?? null
}

async function main() {
  console.log('Fetching Donny Osmond image from Ticketmaster…')
  const imageUrl = await fetchTMImage('Donny Osmond')
  console.log('Image:', imageUrl ?? '(none)')

  // Upsert artist
  const { data: artist, error: artistErr } = await db
    .from('artists')
    .upsert({
      name: 'Donny Osmond',
      slug: 'donny-osmond',
      image_url: imageUrl,
      description: 'Music icon Donny Osmond brings his acclaimed live show to the UK, spanning six decades of hits including Puppy Love, This Is the Moment, and more.',
      tour_name: 'The Great Aloha Tour',
      onsale_date: '2026-05-30T09:00:00Z',
      tickets_url: 'https://www.ticketmaster.co.uk/search?q=donny+osmond',
      is_featured: true,
    }, { onConflict: 'slug' })
    .select('id, slug')
    .single()

  if (artistErr) { console.error('Artist upsert failed:', artistErr); process.exit(1) }
  console.log('Artist upserted:', artist.slug, '(id:', artist.id + ')')

  // Find existing tour or create one
  const { data: existingTours } = await db
    .from('tours')
    .select('id')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false })
    .limit(1)

  let tourId: string
  if (existingTours && existingTours.length > 0) {
    tourId = existingTours[0].id
    await db.from('tours').update({ tour_name: 'The Great Aloha Tour', onsale_date: '2026-05-30T09:00:00Z' }).eq('id', tourId)
    console.log('Updated existing tour (id:', tourId + ')')
  } else {
    const { data: tour, error: tourErr } = await db
      .from('tours')
      .insert({ artist_id: artist.id, tour_name: 'The Great Aloha Tour', onsale_date: '2026-05-30T09:00:00Z' })
      .select('id')
      .single()
    if (tourErr) { console.error('Tour insert failed:', tourErr); process.exit(1) }
    tourId = tour.id
    console.log('Created tour (id:', tourId + ')')
  }

  await seedDates(tourId)
}

async function seedDates(tourId: string) {
  const dates = [
    { date: '2026-09-14T19:30:00Z', venue_name: 'O2 Apollo Manchester', city: 'Manchester' },
    { date: '2026-09-15T19:30:00Z', venue_name: 'O2 Apollo Manchester', city: 'Manchester' },
    { date: '2026-09-17T19:30:00Z', venue_name: 'Utilita Arena Birmingham', city: 'Birmingham' },
    { date: '2026-09-19T19:30:00Z', venue_name: 'Motorpoint Arena Cardiff', city: 'Cardiff' },
    { date: '2026-09-21T19:30:00Z', venue_name: 'P&J Live', city: 'Aberdeen' },
    { date: '2026-09-22T19:30:00Z', venue_name: 'OVO Hydro', city: 'Glasgow' },
    { date: '2026-09-24T19:30:00Z', venue_name: 'Utilita Arena Newcastle', city: 'Newcastle' },
    { date: '2026-09-26T19:30:00Z', venue_name: 'First Direct Arena', city: 'Leeds' },
    { date: '2026-09-28T19:30:00Z', venue_name: 'Nottingham Arena', city: 'Nottingham' },
    { date: '2026-09-30T19:30:00Z', venue_name: 'Brighton Centre', city: 'Brighton' },
    { date: '2026-10-02T19:30:00Z', venue_name: 'The O2 Arena', city: 'London' },
    { date: '2026-10-03T19:30:00Z', venue_name: 'The O2 Arena', city: 'London' },
  ]

  // Delete existing dates for this tour to avoid duplicates on re-run
  await db.from('tour_dates').delete().eq('tour_id', tourId)

  const { error } = await db.from('tour_dates').insert(dates.map(d => ({ ...d, tour_id: tourId })))
  if (error) { console.error('Dates insert failed:', error); process.exit(1) }
  console.log(`Inserted ${dates.length} tour dates.`)
  console.log('\nDone! Visit: /artists/donny-osmond')
}

main().catch(err => { console.error(err); process.exit(1) })
