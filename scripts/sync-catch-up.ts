/**
 * One-time catch-up sync: fetches all Ticketmaster events from the current
 * DB coverage edge through 12 months ahead, using startDateTime to skip
 * events we already have. Much faster than a full re-sync.
 *
 * Run from the project root:
 *   ./node_modules/.bin/tsx scripts/sync-catch-up.ts
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'
import { createClient } from '@supabase/supabase-js'
import { syncTicketmasterEvents } from '../src/lib/ticketmaster'

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv() {
  const lines = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnv()

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Find the current coverage edge
  const { data } = await db
    .from('events')
    .select('start_date')
    .order('start_date', { ascending: false })
    .limit(1)

  const maxDate = data?.[0]?.start_date
    ? new Date(data[0].start_date)
    : new Date()

  // Overlap by 14 days to avoid gaps at the boundary
  const startDateTime = new Date(maxDate.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')

  console.log(`Current DB coverage edge : ${maxDate.toISOString().slice(0, 10)}`)
  console.log(`Fetching events from     : ${startDateTime.slice(0, 10)} → +12 months\n`)

  const result = await syncTicketmasterEvents({ startDateTime })

  console.log('\n── Catch-up complete ─────────────────────────────────')
  console.log(`  Total     : ${result.total}`)
  console.log(`  Inserted  : ${result.inserted}`)
  console.log(`  Skipped   : ${result.skipped}`)
  console.log(`  Errors    : ${result.errors}`)
  console.log(`  Duration  : ${(result.durationMs / 1000).toFixed(1)}s`)
  console.log(`  By category:`, result.byCategory)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
