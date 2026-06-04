/**
 * Phase 4 + 5 backfill: applies migration_014, runs a full 12-month sync
 * (populating public_onsale_start, public_onsale_end, presale_* fields),
 * then calculates boolean flags and prints a debug report.
 *
 * Prerequisites:
 *   1. Apply supabase/migration_014_sale_flags.sql in the Supabase SQL Editor.
 *   2. Run this script:  npx tsx scripts/backfill-sale-fields.ts
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'
import { createClient } from '@supabase/supabase-js'
import { syncTicketmasterEvents } from '../src/lib/ticketmaster'

// ── Load .env.local ────────────────────────────────────────────────────────────
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

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Verify migration_014 is applied ───────────────────────────────────────────
async function checkMigration(): Promise<boolean> {
  const { data, error } = await db
    .from('events')
    .select('public_onsale_start')
    .limit(1)

  if (error && error.message.includes('public_onsale_start')) {
    console.error('\n✗  migration_014 has NOT been applied.')
    console.error('   Apply supabase/migration_014_sale_flags.sql in the Supabase SQL Editor first.\n')
    return false
  }
  console.log('✓  migration_014 columns detected')
  return true
}

// ── Debug report ──────────────────────────────────────────────────────────────
async function printReport(syncResult: Awaited<ReturnType<typeof syncTicketmasterEvents>>) {
  console.log('\n' + '─'.repeat(60))
  console.log('PHASE 5 — DEBUG REPORT')
  console.log('─'.repeat(60))

  type CountResult = { count: number | null; error: { message: string } | null }

  const [
    { count: totalEvents },
    { count: withPublicOnsale },
    { count: withPresale },
    { count: onSaleThisWeek },
    { count: presaleThisWeek },
    { count: upcomingPresale },
    { count: missingSalesData },
  ] = await Promise.all([
    db.from('events').select('*', { count: 'exact', head: true }) as unknown as Promise<CountResult>,
    db.from('events').select('*', { count: 'exact', head: true }).not('public_onsale_start', 'is', null) as unknown as Promise<CountResult>,
    db.from('events').select('*', { count: 'exact', head: true }).not('presale_start', 'is', null) as unknown as Promise<CountResult>,
    db.from('events').select('*', { count: 'exact', head: true }).eq('on_sale_this_week', true) as unknown as Promise<CountResult>,
    db.from('events').select('*', { count: 'exact', head: true }).eq('presale_this_week', true) as unknown as Promise<CountResult>,
    db.from('events').select('*', { count: 'exact', head: true }).eq('upcoming_presale', true) as unknown as Promise<CountResult>,
    db.from('events').select('*', { count: 'exact', head: true }).is('public_onsale_start', null).is('presale_start', null) as unknown as Promise<CountResult>,
  ])

  console.log(`\nAPI FETCH`)
  console.log(`  Total API events processed : ${syncResult.total}`)
  console.log(`  Inserted / updated         : ${syncResult.inserted}`)
  console.log(`  Skipped (no venue/date)    : ${syncResult.skipped}`)
  console.log(`  Errors                     : ${syncResult.errors}`)
  console.log(`  By category                : ${JSON.stringify(syncResult.byCategory)}`)
  console.log(`  Duration                   : ${(syncResult.durationMs / 1000).toFixed(1)}s`)

  console.log(`\nDB TOTALS (all events)`)
  console.log(`  Total events in DB                : ${totalEvents}`)
  console.log(`  Events with public_onsale_start   : ${withPublicOnsale}`)
  console.log(`  Events with presale_start         : ${withPresale}`)
  console.log(`  Events missing all sales data     : ${missingSalesData}`)

  console.log(`\nFLAGS (post-calculation)`)
  console.log(`  on_sale_this_week = true  : ${onSaleThisWeek}`)
  console.log(`  presale_this_week = true  : ${presaleThisWeek}`)
  console.log(`  upcoming_presale  = true  : ${upcomingPresale}`)
  console.log(`  flags_updated             : ${syncResult.flagsUpdated}`)

  // Sample on_sale_this_week events
  if (Number(onSaleThisWeek) > 0) {
    const { data: samples } = await db
      .from('events')
      .select('title, public_onsale_start, start_date')
      .eq('on_sale_this_week', true)
      .order('public_onsale_start', { ascending: true })
      .limit(10)

    console.log(`\nSAMPLE — on_sale_this_week events (up to 10):`)
    for (const s of samples ?? []) {
      console.log(`  ${s.public_onsale_start?.slice(0, 16)}  "${s.title}"  (show: ${s.start_date?.slice(0, 10)})`)
    }
  } else {
    console.log('\nNo on_sale_this_week events found.')
  }

  console.log('\n' + '─'.repeat(60))
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60))
  console.log('BACKFILL: sale fields + flag calculation')
  console.log('='.repeat(60))

  const migOk = await checkMigration()
  if (!migOk) process.exit(1)

  console.log('\nStarting full 12-month sync (this takes several minutes)…\n')
  const result = await syncTicketmasterEvents()

  await printReport(result)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
