import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncTicketmasterAttractions } from '@/lib/ticketmaster'
import { withJobRun } from '@/lib/jobRuns'

// Completes the tours behind "On Sale This Week": for every headliner whose
// event goes on sale (or has a presale) in the window the on-sale pass walks,
// pull ALL of that attraction's UK dates from Ticketmaster so the artist and
// on-sale pages show the whole tour, not just the dates that happened to land
// in one date band.
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

const MAX_ATTRACTIONS = 120
const DAY = 86400000

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const db = createAdminClient()
  const from = new Date(started - 3 * DAY).toISOString()
  const to   = new Date(started + 14 * DAY).toISOString()
  const nowISO = new Date(started).toISOString()

  // Upcoming events with a public on-sale or presale start inside the window.
  const ids = new Set<string>()
  for (const col of ['public_onsale_start', 'onsale_date', 'presale_start'] as const) {
    const { data, error } = await db
      .from('events')
      .select('id')
      .gte(col, from)
      .lte(col, to)
      .gte('start_date', nowISO)
      .limit(1500)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    for (const r of (data ?? []) as { id: string }[]) ids.add(r.id)
  }

  // Their headliners' Ticketmaster attraction ids.
  const eventIds = [...ids]
  const attractionIds = new Set<string>()
  for (let i = 0; i < eventIds.length && attractionIds.size < MAX_ATTRACTIONS; i += 200) {
    const { data, error } = await db
      .from('event_artists')
      .select('artist:artists(ticketmaster_id)')
      .eq('is_headliner', true)
      .in('event_id', eventIds.slice(i, i + 200))
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    for (const r of (data ?? []) as unknown as { artist: { ticketmaster_id: string | null } | null }[]) {
      const tm = r.artist?.ticketmaster_id
      if (tm) attractionIds.add(tm)
    }
  }

  const list = [...attractionIds].slice(0, MAX_ATTRACTIONS)
  try {
    const result = await syncTicketmasterAttractions(list, { deadlineMs: started + 250_000 })
    if (result.inserted > 0) {
      // Keep the on-sale/featured flags in step with the dates just added.
      await (db as unknown as { rpc: (fn: string) => Promise<{ error: unknown }> }).rpc('calculate_event_flags')
    }
    return NextResponse.json({
      success: true,
      windowEvents: eventIds.length,
      ...result,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export const GET = withJobRun('expand-tours', handleGet)
