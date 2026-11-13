// Server side of the daily listings check (rules in listingQuality.ts).
// Reads every upcoming listing on the site, hides exact duplicates, records
// anything doubtful for /admin/listing-check, and emails hello@ only when
// something NEW needs a look.

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages } from '@/lib/pagedFetch'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { checkListings, type QualityRow } from '@/lib/listingQuality'
import { resend, FROM_EMAIL } from '@/lib/resend'

export interface ListingCheckResult {
  scanned: number
  autoHidden: number
  openIssues: number
  newIssues: number
  emailed: boolean
  firstRun: boolean
}

const SITE = 'https://www.theshowfinder.com'
const KIND_LABEL: Record<string, string> = {
  near_duplicate: 'Possible duplicate',
  not_a_show_words: 'May not be a show',
  placeholder_time: '23:59 start',
}

export async function runListingCheck(): Promise<ListingCheckResult> {
  const db = createAdminClient()
  const runISO = new Date().toISOString()

  const rows = await fetchAllPages<QualityRow>((from, to) => db
    .from('listed_events_with_venue')
    .select('id, title, start_date, venue_id, venue_name, price_from')
    .gte('start_date', runISO)
    .in('status', LIVE_EVENT_STATUSES)
    .order('id')
    .range(from, to) as unknown as PromiseLike<{ data: QualityRow[] | null; error: { message: string } | null }>)

  const { autoHide, issues } = checkListings(rows)

  for (let i = 0; i < autoHide.length; i += 500) {
    const { error } = await db.from('listing_hides').upsert(
      autoHide.slice(i, i + 500).map(h => ({ event_id: h.eventId, reason: h.reason, hidden_by: 'listing-check' })),
      { onConflict: 'event_id', ignoreDuplicates: true },
    )
    if (error) throw new Error(`listing_hides: ${error.message} (has migration 124 been run?)`)
  }

  const { count: before } = await db.from('listing_quality_issues').select('id', { count: 'exact', head: true })
  const firstRun = (before ?? 0) === 0
  for (let i = 0; i < issues.length; i += 500) {
    // ignoreDuplicates: something already looked at (marked fine or hidden) is never raised again.
    const { error } = await db.from('listing_quality_issues').upsert(
      issues.slice(i, i + 500).map(x => ({ event_id: x.eventId, other_event_id: x.otherEventId ?? null, kind: x.kind, detail: x.detail, first_seen_at: runISO })),
      { onConflict: 'event_id,kind', ignoreDuplicates: true },
    )
    if (error) throw new Error(`listing_quality_issues: ${error.message}`)
  }

  const { data: fresh } = await db
    .from('listing_quality_issues')
    .select('kind, detail, events!listing_quality_issues_event_id_fkey(title, slug, start_date)')
    .eq('status', 'open')
    .eq('first_seen_at', runISO)
    .limit(500)
  const newOnes = (fresh ?? []) as unknown as { kind: string; detail: string; events: { title: string; slug: string; start_date: string } | null }[]
  const { count: openCount } = await db.from('listing_quality_issues').select('id', { count: 'exact', head: true }).eq('status', 'open')

  // The first run finds the whole backlog at once: that goes on the admin page, not in an email.
  let emailed = false
  if (newOnes.length > 0 && !firstRun) {
    const lines = newOnes.slice(0, 20).map(n => `- ${KIND_LABEL[n.kind] ?? n.kind}: ${n.events?.title ?? '?'} (${n.events?.start_date?.slice(0, 10) ?? ''})\n  ${n.detail}\n  ${SITE}/events/${n.events?.slug ?? ''}`)
    const text = [
      `The daily listings check found ${newOnes.length} new listing${newOnes.length === 1 ? '' : 's'} that may not belong on the site.`,
      autoHide.length ? `It also hid ${autoHide.length} exact duplicate${autoHide.length === 1 ? '' : 's'} automatically.` : '',
      '',
      ...lines,
      newOnes.length > 20 ? `\n...and ${newOnes.length - 20} more.` : '',
      '',
      `Review them (one tap each: "Looks fine" or "Hide"): ${SITE}/admin/listing-check`,
    ].filter(l => l !== '').join('\n')
    const { error } = await resend.emails.send({
      from: FROM_EMAIL, to: 'hello@theshowfinder.com',
      subject: `Listings check: ${newOnes.length} to look at`, text,
    })
    if (error) console.error('[listing-check] email failed', error)
    else emailed = true
  }

  return { scanned: rows.length, autoHidden: autoHide.length, openIssues: openCount ?? 0, newIssues: newOnes.length, emailed, firstRun }
}
