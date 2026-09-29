/**
 * One-time backfill: every event synced before src/lib/ticketmaster.ts wrote
 * a `description` (i.e. all of them, historically — see the 2026-09-29 SEO
 * audit) has description IS NULL / ''. Ticketmaster's own info/pleaseNote
 * text was never captured for these, so there's nothing richer to pull from
 * their API — we just synthesize a description from data already in our own
 * DB (title, venue name/city, start_date, category), using the exact same
 * buildFallbackDescription() the live sync now uses for new events, so
 * wording never drifts between the two paths.
 *
 * Run from the project root:
 *   npx tsx scripts/backfill-event-descriptions.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { buildFallbackDescription } from '../src/lib/eventDescription'
import type { EventCategory } from '../src/lib/types/database'

// ── Load .env.local ────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing required env vars — check .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

interface EventRow {
  id: string
  title: string
  start_date: string
  category: EventCategory
  venue_id: string | null
}

interface VenueRow {
  id: string
  name: string
  city: string
}

async function main() {
  console.log('Fetching events with NULL/empty description…')

  const PAGE = 1000
  let offset = 0
  const events: EventRow[] = []

  while (true) {
    const { data, error } = await db
      .from('events')
      .select('id, title, start_date, category, venue_id')
      .or('description.is.null,description.eq.')
      .range(offset, offset + PAGE - 1)

    if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1) }
    if (!data?.length) break
    events.push(...(data as EventRow[]))
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`Found ${events.length} events to backfill.\n`)
  if (!events.length) { console.log('Nothing to do.'); return }

  // Pull every distinct venue referenced, in pages, then build an id → row map.
  const venueIds = [...new Set(events.map(e => e.venue_id).filter((v): v is string => !!v))]
  const venueMap = new Map<string, VenueRow>()

  for (let i = 0; i < venueIds.length; i += PAGE) {
    const batch = venueIds.slice(i, i + PAGE)
    const { data, error } = await db
      .from('venues')
      .select('id, name, city')
      .in('id', batch)

    if (error) { console.error('Supabase venue fetch failed:', error.message); process.exit(1) }
    for (const v of (data ?? []) as VenueRow[]) venueMap.set(v.id, v)
  }

  console.log(`Loaded ${venueMap.size} venues for lookup.\n`)

  let updated = 0
  let errors  = 0
  const BATCH = 200

  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH)
    const pct = (((i + batch.length) / events.length) * 100).toFixed(1)
    process.stdout.write(`\r[${i + batch.length}/${events.length}] ${pct}%  `)

    const results = await Promise.all(batch.map(async (ev) => {
      const venue = ev.venue_id ? venueMap.get(ev.venue_id) : undefined
      const description = buildFallbackDescription({
        title:     ev.title,
        venueName: venue?.name ?? null,
        city:      venue?.city ?? null,
        startDate: ev.start_date,
        category:  ev.category,
      })

      const { error } = await db
        .from('events')
        .update({ description })
        .eq('id', ev.id)

      return error ? { ok: false, error } : { ok: true }
    }))

    for (const r of results) {
      if (r.ok) updated++
      else { errors++; console.error(`\n  update error:`, r.error?.message) }
    }
  }

  console.log('\n\n── Backfill complete ──────────────────────────')
  console.log(`  Total events processed : ${events.length}`)
  console.log(`  description set        : ${updated}`)
  console.log(`  Errors                 : ${errors}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
