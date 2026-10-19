import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enrichArtist, type EnrichableArtist } from '@/lib/artistEnrichRun'

// Fills in artist profile info (genre, official links, a short Wikipedia-sourced
// bio) in batches, busiest artists first. The artist page also enriches an
// artist the first time it is opened, so this job mostly works through the long
// tail. Bios only come from the Wikipedia page Ticketmaster links for that
// artist. Add ?limit=N to run a smaller or larger batch by hand.
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

const DEFAULT_PER_RUN = 450
const CONCURRENCY     = 4
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const deadline = started + 240_000
  const requested = Number(new URL(request.url).searchParams.get('limit'))
  const maxPerRun = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 1000) : DEFAULT_PER_RUN
  const db = createAdminClient()

  const { data: busiest, error: viewErr } = await db
    .from('artists_with_upcoming').select('id')
    .order('upcoming_count', { ascending: false })
    .limit(6000) as unknown as { data: { id: string }[] | null; error: { message: string } | null }
  if (viewErr) {
    return NextResponse.json({ success: false, error: `artists_with_upcoming: ${viewErr.message} (run migration 052)` }, { status: 500 })
  }

  const todo: EnrichableArtist[] = []
  const ids = (busiest ?? []).map(r => r.id)
  for (let i = 0; i < ids.length && todo.length < maxPerRun; i += 200) {
    const { data, error } = await db
      .from('artists')
      .select('id, ticketmaster_id, bio, genre, website, enriched_at')
      .in('id', ids.slice(i, i + 200))
      .is('enriched_at', null)
      .not('ticketmaster_id', 'is', null) as unknown as { data: EnrichableArtist[] | null; error: { message: string } | null }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    const byId = new Map((data ?? []).map(a => [a.id, a]))
    for (const id of ids.slice(i, i + 200)) {
      const a = byId.get(id)
      if (a && todo.length < maxPerRun) todo.push(a)
    }
  }

  const counters = { withBio: 0, withGenre: 0 }
  const tally: Record<string, number> = {}
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    if (Date.now() > deadline) break
    const batch = todo.slice(i, i + CONCURRENCY)
    const outcomes = await Promise.all(batch.map(a => enrichArtist(db, a, counters)))
    for (const o of outcomes) tally[o] = (tally[o] ?? 0) + 1
    if (outcomes.includes('missing_columns')) {
      return NextResponse.json({ success: false, error: 'artists columns missing (run migration 052)' }, { status: 500 })
    }
    if (outcomes.includes('rate_limited')) { await sleep(2500) }
    await sleep(400)
  }

  return NextResponse.json({
    success: true, candidates: todo.length, ...tally, ...counters,
    note: todo.length >= maxPerRun ? 'Batch limit reached: run again (or wait for tomorrow) to continue.' : undefined,
    seconds: Math.round((Date.now() - started) / 1000),
  })
}
