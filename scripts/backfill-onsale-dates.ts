/**
 * One-time backfill: fetch sales.public.startDateTime from Ticketmaster for
 * every event that has a ticketmaster_id but no onsale_date, then write it
 * back to Supabase.
 *
 * Run from the project root:
 *   npx tsx scripts/backfill-onsale-dates.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

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

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TM_API_KEY      = process.env.TICKETMASTER_API_KEY!
const TM_BASE         = 'https://app.ticketmaster.com/discovery/v2'
const RATE_LIMIT_MS   = 250   // 4 req/s — safely under TM's 5 req/s cap
const RETRY_AFTER_MS  = 5_000 // wait after a 429

if (!SUPABASE_URL || !SERVICE_KEY || !TM_API_KEY) {
  console.error('Missing required env vars — check .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── Fetch one TM event by ID ───────────────────────────────────────────────

interface TMSales {
  sales?: { public?: { startDateTime?: string } }
}

async function fetchTMEvent(tmId: string): Promise<string | null> {
  const url = `${TM_BASE}/events/${tmId}.json?apikey=${TM_API_KEY}&locale=en-us`

  let attempts = 0
  while (attempts < 3) {
    attempts++
    const res = await fetch(url)

    if (res.status === 404) return null      // event deleted on TM side
    if (res.status === 429) {
      console.warn(`  [429] rate limited — waiting ${RETRY_AFTER_MS / 1000}s`)
      await sleep(RETRY_AFTER_MS)
      continue
    }
    if (!res.ok) {
      console.warn(`  [${res.status}] unexpected status for ${tmId}`)
      return null
    }

    const data = (await res.json()) as TMSales
    return data.sales?.public?.startDateTime ?? null
  }

  return null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching events with ticketmaster_id but no onsale_date…')

  // Fetch in pages of 1000 to avoid hitting Supabase row limits
  const PAGE = 1000
  let offset = 0
  const events: { id: string; ticketmaster_id: string; title: string }[] = []

  while (true) {
    const { data, error } = await db
      .from('events')
      .select('id, ticketmaster_id, title')
      .not('ticketmaster_id', 'is', null)
      .is('onsale_date', null)
      .range(offset, offset + PAGE - 1)

    if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1) }
    if (!data?.length) break
    events.push(...(data as typeof events))
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`Found ${events.length} events to backfill.\n`)
  if (!events.length) { console.log('Nothing to do.'); return }

  let updated   = 0
  let nulled     = 0   // TM has no sale date for this event
  let notFound  = 0   // 404 from TM
  let errors    = 0

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const pct = (((i + 1) / events.length) * 100).toFixed(1)
    process.stdout.write(`\r[${i + 1}/${events.length}] ${pct}%  `)

    let onsaleDate: string | null = null
    try {
      onsaleDate = await fetchTMEvent(ev.ticketmaster_id)
    } catch (err) {
      console.error(`\n  fetch error for ${ev.ticketmaster_id}:`, err)
      errors++
      await sleep(RATE_LIMIT_MS)
      continue
    }

    if (onsaleDate === null) {
      // 404 or genuinely no sale date on TM — skip, don't update
      notFound++
    } else {
      const { error: updateErr } = await db
        .from('events')
        .update({ onsale_date: onsaleDate })
        .eq('id', ev.id)

      if (updateErr) {
        console.error(`\n  update error for ${ev.id}:`, updateErr.message)
        errors++
      } else {
        updated++
      }
    }

    await sleep(RATE_LIMIT_MS)
  }

  console.log('\n\n── Backfill complete ──────────────────────────')
  console.log(`  Total events processed : ${events.length}`)
  console.log(`  onsale_date set        : ${updated}`)
  console.log(`  No sale date on TM     : ${nulled + notFound}`)
  console.log(`  Errors                 : ${errors}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
