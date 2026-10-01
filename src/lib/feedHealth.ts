// Pure feed-health summarization logic for the admin Feed Health page
// (src/app/admin/news/feeds/page.tsx) — Phase 4 ("Fresh News & Editorial
// Operations"). Dependency-free (no Supabase client, no '@/' aliases) so
// it can be unit-tested directly with Node's built-in test runner, same
// reasoning as newsPublishing.ts / newsFiltering.ts.
//
// sync_log is a shared table — src/lib/cityNews.ts (the RSS city-news
// sync), src/lib/ticketmaster.ts (the Ticketmaster events sync) and
// src/lib/councilEvents.ts all write to it, distinguished only by their
// `city` label (there is no dedicated "source"/"job" column). This module
// only ever receives rows the caller has already filtered down to the
// city-news pipeline's own labels (the 36 UK cities + NATIONAL_NAME, plus
// any NATIONAL_OUTLET_LOG_PREFIX-prefixed rows for a single national-feed
// outlet's own failures) — see the page component for that filter.

export interface SyncLogRow {
  city: string
  started_at: string
  completed_at: string | null
  events_synced: number | null
  status: string | null
  error: string | null
}

export interface FeedHealthSummary {
  name: string
  lastRun: SyncLogRow | null
  isStale: boolean
  recentRunCount: number
  recentFailureCount: number
}

// The city-news sync runs once daily (vercel.json: 03:00 UTC). 30 hours
// gives a full day plus a buffer before a feed with no recent row is
// treated as "stale" rather than "just hasn't run yet today".
export const FEED_STALE_THRESHOLD_MS = 30 * 60 * 60 * 1000

// Builds one summary per known feed name, even for a feed with zero log
// rows at all (shown as "never run" rather than silently omitted — a feed
// that has never once logged a run is exactly the kind of thing requirement
// 6 asks to surface, not hide). Rows for names outside `feedNames` are
// ignored — the caller's job is to pass only this pipeline's own labels.
export function summarizeFeedHealth(
  feedNames: string[],
  logs: SyncLogRow[],
  now: number,
  recentWindow = 5
): FeedHealthSummary[] {
  const byFeed = new Map<string, SyncLogRow[]>()
  for (const name of feedNames) byFeed.set(name, [])
  for (const log of logs) {
    const list = byFeed.get(log.city)
    if (list) list.push(log)
  }

  return feedNames.map(name => {
    const rows = (byFeed.get(name) ?? [])
      .slice()
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    const lastRun = rows[0] ?? null
    const isStale = !lastRun || now - new Date(lastRun.started_at).getTime() > FEED_STALE_THRESHOLD_MS
    const recent = rows.slice(0, recentWindow)
    const recentFailureCount = recent.filter(r => r.status === 'error').length
    return { name, lastRun, isStale, recentRunCount: recent.length, recentFailureCount }
  })
}

// The subset an admin should actually look at: never run, stale, or has
// failed at least once in its last `recentWindow` runs.
export function feedsNeedingAttention(summaries: FeedHealthSummary[]): FeedHealthSummary[] {
  return summaries.filter(s => s.isStale || s.recentFailureCount > 0)
}
