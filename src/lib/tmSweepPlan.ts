// Pure planning helpers for the national Ticketmaster sweep. No '@/' imports so it runs under
// `node --test`.
//
// Ticketmaster's Discovery API will only page through the first 1,000 results of any query
// (page size 200, pages 0-4). To see every event we ask for a date window, read how many
// matches there are, and split the window in half until each piece fits under the cap.

export const PAGE_SIZE = 200
/** Deep-paging limit: size * page must stay under 1000, so a query can return at most this many. */
export const MAX_QUERY_RESULTS = 1000
export const MIN_SPLITTABLE_MS = 2 * 3_600_000
export const SWEEP_HORIZON_MONTHS = 24
export const FIRST_CHUNK_DAYS = 30
/** A finished cycle is not restarted until this long after it began, so cron retries do not re-sweep. */
export const MIN_HOURS_BETWEEN_CYCLES = 20

export function pagesNeeded(total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.ceil(total / PAGE_SIZE), MAX_QUERY_RESULTS / PAGE_SIZE)
}

/** True when the window holds more events than one query can return and can still be halved. */
export function needsSplit(total: number, startMs: number, endMs: number): boolean {
  return total > MAX_QUERY_RESULTS && endMs - startMs > MIN_SPLITTABLE_MS
}

export function splitWindow(startMs: number, endMs: number): [[number, number], [number, number]] {
  const mid = startMs + Math.floor((endMs - startMs) / 2)
  return [[startMs, mid], [mid, endMs]]
}

export function horizonEnd(cycleStart: Date): Date {
  const d = new Date(cycleStart)
  d.setUTCMonth(d.getUTCMonth() + SWEEP_HORIZON_MONTHS)
  return d
}

export interface SweepCursor {
  segmentIndex: number
  windowStart: string | null
  cycleStartedAt: string | null
  completedAt: string | null
}

export type CycleDecision =
  | { action: 'start' }
  | { action: 'continue' }
  | { action: 'idle'; reason: string }

/** Decide whether this run starts a new sweep, resumes the current one, or does nothing. */
export function decideCycle(cursor: SweepCursor | null, now: Date): CycleDecision {
  if (!cursor || !cursor.cycleStartedAt) return { action: 'start' }
  const started = new Date(cursor.cycleStartedAt).getTime()
  const finished = cursor.completedAt ? new Date(cursor.completedAt).getTime() : null
  const inProgress = finished === null || finished < started
  if (inProgress) return { action: 'continue' }
  const hoursSinceStart = (now.getTime() - started) / 3_600_000
  if (hoursSinceStart >= MIN_HOURS_BETWEEN_CYCLES) return { action: 'start' }
  return { action: 'idle', reason: 'latest sweep already complete' }
}

/**
 * When a verification call to Ticketmaster says "not found" we only believe it if a control event
 * that definitely exists was found in the same run; otherwise an outage would delist real shows.
 */
export function mayMarkGone(controlFound: boolean): boolean {
  return controlFound
}

export function chunkEnd(startMs: number, horizonMs: number): number {
  return Math.min(startMs + FIRST_CHUNK_DAYS * 86_400_000, horizonMs)
}
