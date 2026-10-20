// Which events have a Ticketmaster "public on-sale" date that is really a re-release (or wrong)? Calls the
// database function onsale_reissued_ids() (migration 077): presale ended >14 days before the public date,
// the public date is after the show, or another live listing for the same act/venue/day opened >7 days
// earlier. Fails open: if the lookup errors, nothing is hidden and the page behaves as before.
import type { SupabaseClient } from '@supabase/supabase-js'

const CHUNK = 300

export async function reissuedEventIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('onsale_reissued_ids', { p_ids: unique.slice(i, i + CHUNK) }) as unknown as { data: string[] | null; error: { message: string } | null }
    if (error) { console.error('[onsale-reissued] lookup failed:', error.message); return out }
    for (const id of data ?? []) out.add(id)
  }
  return out
}

/** Drop events whose on-sale date is a re-release. Never throws. */
export async function dropReissued<T extends { id: string }>(supabase: SupabaseClient, events: T[]): Promise<T[]> {
  if (events.length === 0) return events
  const bad = await reissuedEventIds(supabase, events.map(e => e.id))
  return bad.size ? events.filter(e => !bad.has(e.id)) : events
}
