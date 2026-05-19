/**
 * One-time script: create Morrissey tour and add Dec 2026 dates
 * Run: npx tsx scripts/seed-morrissey-dates.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim()
  }
}

import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ARTIST_ID = 'c3bb2b0d-171f-4872-9ac5-fb392e3496a1'

// December 2026 — UK is on GMT so times are UTC
const DATES = [
  { date: '2026-12-06T19:30:00Z', venue_name: 'Brighton Centre',   city: 'Brighton'  },
  { date: '2026-12-10T19:30:00Z', venue_name: 'Utilita Arena',     city: 'Cardiff'   },
  { date: '2026-12-12T19:30:00Z', venue_name: 'M&S Bank Arena',    city: 'Liverpool' },
  { date: '2026-12-16T19:30:00Z', venue_name: 'OVO Arena',         city: 'Glasgow'   },
  { date: '2026-12-19T19:30:00Z', venue_name: 'First Direct Arena', city: 'Leeds'    },
]

async function main() {
  // Create tour
  const { data: tour, error: tourErr } = await db
    .from('tours')
    .insert({ artist_id: ARTIST_ID, tour_name: 'Live In Concert Tour', onsale_date: '2026-12-01T00:00:00Z' })
    .select('id')
    .single()

  if (tourErr) { console.error('Tour insert failed:', tourErr); process.exit(1) }
  console.log('Tour created (id:', tour.id + ')')

  const { error: datesErr } = await db
    .from('tour_dates')
    .insert(DATES.map(d => ({ ...d, tour_id: tour.id })))

  if (datesErr) { console.error('Dates insert failed:', datesErr); process.exit(1) }
  console.log(`Inserted ${DATES.length} tour dates.`)

  const { data: check } = await db
    .from('tour_dates').select('date, venue_name, city')
    .eq('tour_id', tour.id).order('date', { ascending: true })
  console.log('\nDates in DB:')
  for (const d of check ?? []) {
    console.log(' ', new Date(d.date).toISOString().slice(0, 10), '-', d.venue_name + ',', d.city)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
