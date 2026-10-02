// Shared helpers for the "how many upcoming events does this city have"
// count used by the homepage/navigation city cards (CitiesGrid.tsx) and
// each city page's own hero stat line (src/app/cities/[city]/page.tsx).
//
// Root cause of the intermittent "Coming soon" bug (London, reported Oct
// 2026): both call sites ran a Supabase `count:'exact', head:true` query
// and read only `result.count`, never `result.error`. Postgres/PostgREST
// return `count: null` in BOTH of these cases:
//   - the query genuinely matched zero rows (a real "no events" city), and
//   - the query itself failed (timeout, transient connection drop, RLS
//     hiccup, etc).
// `result.count ?? 0` collapsed both into the same `0`, so a transient
// query failure rendered identically to "this city has no events" —
// exactly the symptom described (correct underlying data, wrong
// intermittent display, self-resolving on the next successful request/
// revalidation). resolveCityEventCount keeps those two states distinct
// so callers can choose a different fallback for a genuine error than
// for a genuine zero, instead of silently asserting "Coming soon"
// (or any other zero-event message) either way.

export interface CountQueryResult {
  count: number | null
  error?: unknown
}

export type CityCountOutcome =
  | { ok: true; count: number }
  | { ok: false }

export function resolveCityEventCount(result: CountQueryResult): CityCountOutcome {
  if (result.error) return { ok: false }
  // A successful head:true count query with `count: null` and no error
  // means Postgres genuinely matched zero rows — a real zero, not a
  // stand-in for a failure.
  return { ok: true, count: result.count ?? 0 }
}

// Trims and collapses incidental whitespace in a city name before it's
// used as an .ilike() filter value, mirroring the normalization already
// applied to venue_city at write time (normalizeCityName in
// src/lib/ticketmaster.ts). .ilike() already matches case-insensitively
// at the database level, so this only needs to handle whitespace.
export function normalizeCityFilterValue(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

// A pure approximation of how `.ilike(column, value)` matches two city
// names when `value` contains no wildcards: case-insensitive, and (after
// normalizeCityFilterValue) whitespace-insensitive. There's no live
// database in this test runner, so this is how that matching contract
// gets regression-tested — it isn't a replacement for the real query,
// which still does the actual filtering server-side.
export function cityNamesMatch(a: string, b: string): boolean {
  return normalizeCityFilterValue(a).toLowerCase() === normalizeCityFilterValue(b).toLowerCase()
}
