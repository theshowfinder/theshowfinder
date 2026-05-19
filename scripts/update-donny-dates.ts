/**
 * One-time script: replace Donny Osmond tour dates with correct ones
 * Run: npx tsx scripts/update-donny-dates.ts
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

// January/February 2027 — UK is on GMT so times are UTC
const DATES = [
  { date: '2027-01-20T18:30:00Z', venue_name: 'OVO Hydro',                          city: 'Glasgow'      },
  { date: '2027-01-21T18:00:00Z', venue_name: 'Utilita Arena Newcastle',             city: 'Newcastle'    },
  { date: '2027-01-23T18:30:00Z', venue_name: 'M&S Bank Arena Liverpool',            city: 'Liverpool'    },
  { date: '2027-01-24T19:30:00Z', venue_name: 'Co-op Live',                          city: 'Manchester'   },
  { date: '2027-01-26T17:30:00Z', venue_name: 'Connexin Live (Venue Premium)',       city: 'Hull'         },
  { date: '2027-01-26T18:30:00Z', venue_name: 'Connexin Live',                       city: 'Hull'         },
  { date: '2027-01-27T18:00:00Z', venue_name: 'Motorpoint Arena Nottingham',         city: 'Nottingham'   },
  { date: '2027-01-29T18:00:00Z', venue_name: 'Leeds First Direct Bank Arena (Venue Premium)', city: 'Leeds' },
  { date: '2027-01-29T18:30:00Z', venue_name: 'Leeds First Direct Bank Arena',       city: 'Leeds'        },
  { date: '2027-01-30T18:00:00Z', venue_name: 'bp pulse LIVE',                       city: 'Birmingham'   },
  { date: '2027-02-01T18:30:00Z', venue_name: 'Utilita Arena Cardiff',               city: 'Cardiff'      },
  { date: '2027-02-03T18:30:00Z', venue_name: 'Bournemouth International Centre',    city: 'Bournemouth'  },
  { date: '2027-02-05T18:30:00Z', venue_name: 'Eventim Apollo',                      city: 'London'       },
  { date: '2027-02-06T18:30:00Z', venue_name: 'Eventim Apollo',                      city: 'London'       },
]

async function main() {
  // Get artist
  const { data: artist, error: aErr } = await db
    .from('artists').select('id').eq('slug', 'donny-osmond').single()
  if (aErr || !artist) { console.error('Artist not found:', aErr); process.exit(1) }
  console.log('Artist id:', artist.id)

  // Get tour
  const { data: tours, error: tErr } = await db
    .from('tours').select('id').eq('artist_id', artist.id)
    .order('created_at', { ascending: false }).limit(1)
  if (tErr || !tours?.length) { console.error('Tour not found:', tErr); process.exit(1) }
  const tourId = tours[0].id
  console.log('Tour id:', tourId)

  // Delete all existing dates
  const { error: delErr } = await db.from('tour_dates').delete().eq('tour_id', tourId)
  if (delErr) { console.error('Delete failed:', delErr); process.exit(1) }
  console.log('Deleted existing tour dates.')

  // Insert new dates
  const { error: insErr } = await db.from('tour_dates').insert(
    DATES.map(d => ({ ...d, tour_id: tourId }))
  )
  if (insErr) { console.error('Insert failed:', insErr); process.exit(1) }
  console.log(`Inserted ${DATES.length} tour dates.`)

  // Also update the seed script's dates list is handled separately; confirm DB state
  const { data: check } = await db
    .from('tour_dates').select('date, venue_name, city')
    .eq('tour_id', tourId).order('date', { ascending: true })
  console.log('\nFinal dates in DB:')
  for (const d of check ?? []) {
    console.log(' ', new Date(d.date).toISOString().slice(0, 16).replace('T', ' '), '-', d.venue_name + ',', d.city)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
