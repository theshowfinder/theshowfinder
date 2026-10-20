// Loads what the Morning import check needs: recent runs of each import job, each sweep's mode,
// and the newest timestamp inside the imported data itself (so "job said OK" is confirmed by the data).
import { createAdminClient } from '@/lib/supabase/admin'
import { IMPORT_SOURCES, evaluateImports, type ImportCard, type ImportSourceKey, type RunRow, type SweepMode } from '@/lib/importStatus'

export const MODE_TABLES: Partial<Record<ImportSourceKey, string>> = {
  ticketmaster: 'tm_sweep_state',
  see_tickets: 'see_tickets_sweep_state',
  gigsberg: 'gigsberg_sweep_state',
  council: 'council_sync_state',
}

async function newest(table: string, column: string, filter?: (q: any) => any): Promise<string | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const db = createAdminClient()
    let q = db.from(table as never).select(column).not(column, 'is', null).order(column, { ascending: false }).limit(1)
    if (filter) q = filter(q)
    const { data } = await q as unknown as { data: Array<Record<string, string>> | null }
    return data?.[0]?.[column] ?? null
  } catch {
    return null
  }
}

export async function loadImportCards(now = new Date()): Promise<ImportCard[]> {
  const db = createAdminClient()
  const jobs = IMPORT_SOURCES.flatMap(s => s.jobs.map(j => j.job))
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString()

  const runsP = db.from('job_runs').select('job, started_at, finished_at, status, error, summary').in('job', jobs).gte('started_at', since).order('started_at', { ascending: false }).limit(400)
  const modeP = Promise.all(Object.entries(MODE_TABLES).map(async ([key, table]) => {
    try {
      const { data } = await db.from(table as never).select('mode').eq('id', 1).maybeSingle() as unknown as { data: { mode?: string } | null }
      return [key, (data?.mode as SweepMode | undefined) ?? null] as const
    } catch { return [key, null] as const }
  }))
  const proofP = Promise.all([
    newest('events', 'last_synced_at', q => q.not('ticketmaster_id', 'is', null)),
    newest('see_tickets_catalogue_events', 'last_seen_at'),
    newest('gigsberg_catalogue_events', 'last_seen_at'),
    newest('events', 'updated_at', q => q.eq('source', 'derby_council')),
    newest('city_news', 'fetched_at'),
  ])

  const [runsRes, modeList, proofList] = await Promise.all([runsP, modeP, proofP])
  const modes: Partial<Record<ImportSourceKey, SweepMode>> = {}
  for (const [k, m] of modeList) if (m) modes[k as ImportSourceKey] = m
  const [tm, st, gb, council, news] = proofList
  return evaluateImports({
    runs: (runsRes.data ?? []) as RunRow[],
    modes,
    proof: { ticketmaster: tm, see_tickets: st, gigsberg: gb, council, news },
    now,
  })
}
