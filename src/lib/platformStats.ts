// Per-platform numbers for the admin platform tiles: how many events on the site come from / are linked to each
// platform, and what is not linked yet. Every metric has a `view` that opens the list behind the number.
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'

export type PlatformKey = 'ticketmaster' | 'gigsberg' | 'see_tickets' | 'council'

export interface Metric { label: string; value: number | null; view?: string; tone?: 'good' | 'bad' | 'warn'; hint?: string }
export interface PlatformTile {
  key: PlatformKey
  label: string
  blurb: string
  metrics: Metric[]
  lastRefresh: string | null
  lastImport: { mode: string; at: string | null; gigsberg?: ImportBit; see_tickets?: ImportBit } | null
}
export interface ImportBit { eligible: number; wouldImport: number; imported: number; errors: number }

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

const FUTURE = () => new Date().toISOString()
const TODAY = () => new Date().toISOString().slice(0, 10)

async function count(build: (db: Loose) => PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count: n, error } = await build(createAdminClient() as Loose)
    return error ? null : n
  } catch {
    return null
  }
}

const events = (db: Loose) => db.from('events').select('id', { count: 'exact', head: true }).gte('start_date', FUTURE()).in('status', LIVE_EVENT_STATUSES)
const gb = (db: Loose) => db.from('gigsberg_catalogue_events').select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', TODAY())
const st = (db: Loose) => db.from('see_tickets_catalogue_events').select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', TODAY())

async function newest(table: string, column: string, filter?: (q: Loose) => Loose): Promise<string | null> {
  try {
    const db = createAdminClient() as Loose
    let q = db.from(table).select(column).not(column, 'is', null).order(column, { ascending: false }).limit(1)
    if (filter) q = filter(q)
    const { data } = await q as { data: Array<Record<string, string>> | null }
    return data?.[0]?.[column] ?? null
  } catch { return null }
}

export async function loadPlatformTiles(): Promise<PlatformTile[]> {
  const db = createAdminClient() as Loose
  const [
    tmOn, tmNoLink, tmGb, tmSt,
    gbAll, gbLinked, gbReview, gbUnlinked, gbOnSite, gbCreated, gbGone,
    stAll, stLinked, stReview, stUnlinked, stOnSite, stCreated, stGone,
    cOn,
    fresh, importState,
    tmAt, gbAt, stAt, cAt,
  ] = await Promise.all([
    count(d => events(d).not('ticketmaster_id', 'is', null)),
    count(d => events(d).not('ticketmaster_id', 'is', null).is('tickets_url', null)),
    count(d => events(d).not('ticketmaster_id', 'is', null).not('gigsberg_affiliate_url', 'is', null)),
    count(d => events(d).not('ticketmaster_id', 'is', null).not('see_tickets_affiliate_url', 'is', null)),

    count(d => gb(d)),
    count(d => gb(d).not('matched_event_id', 'is', null)),
    count(d => gb(d).is('matched_event_id', null).eq('match_status', 'review')),
    count(d => gb(d).is('matched_event_id', null).neq('match_status', 'review')),
    count(d => events(d).not('gigsberg_affiliate_url', 'is', null)),
    count(d => events(d).eq('source', 'gigsberg')),
    count(d => d.from('gigsberg_catalogue_events').select('id', { count: 'exact', head: true }).not('gone_at', 'is', null).gte('event_date', TODAY())),

    count(d => st(d)),
    count(d => st(d).not('matched_event_id', 'is', null)),
    count(d => st(d).is('matched_event_id', null).eq('match_status', 'review')),
    count(d => st(d).is('matched_event_id', null).neq('match_status', 'review')),
    count(d => events(d).not('see_tickets_affiliate_url', 'is', null)),
    count(d => events(d).eq('source', 'see_tickets')),
    count(d => d.from('see_tickets_catalogue_events').select('id', { count: 'exact', head: true }).not('gone_at', 'is', null).gte('event_date', TODAY())),

    count(d => events(d).like('source', '%_council')),

    db.rpc('health_tm_freshness').then((r: { data: Array<{ stale_48h: number | string }> | null }) => (r.data?.[0] ? Number(r.data[0].stale_48h) : null)).catch(() => null) as Promise<number | null>,
    db.from('feed_import_state').select('mode, last_stats').eq('id', 1).maybeSingle().then((r: { data: { mode: string; last_stats: Record<string, unknown> | null } | null }) => r.data).catch(() => null) as Promise<{ mode: string; last_stats: Record<string, unknown> | null } | null>,

    newest('events', 'last_synced_at', q => q.not('ticketmaster_id', 'is', null)),
    newest('gigsberg_catalogue_events', 'last_seen_at'),
    newest('see_tickets_catalogue_events', 'last_seen_at'),
    newest('events', 'updated_at', q => q.like('source', '%_council')),
  ])

  const stats = importState?.last_stats as { at?: string; gigsberg?: ImportBit; see_tickets?: ImportBit } | null
  const lastImport = importState ? { mode: importState.mode, at: stats?.at ?? null, gigsberg: stats?.gigsberg, see_tickets: stats?.see_tickets } : null
  const pct = (n: number | null, d: number | null) => (n !== null && d ? `${Math.round((n / d) * 100)}%` : undefined)

  return [
    {
      key: 'ticketmaster', label: 'Ticketmaster', blurb: 'The base catalogue: every event, date and venue.', lastRefresh: tmAt, lastImport: null,
      metrics: [
        { label: 'Events on the site', value: tmOn, view: 'all' },
        { label: 'Missing a buy button', value: tmNoLink, view: 'no_link', tone: tmNoLink ? 'bad' : 'good' },
        { label: 'Not refreshed in 48h', value: fresh, view: 'stale', tone: fresh ? 'warn' : 'good', hint: 'should be near zero once the sweep has finished a lap' },
        { label: 'Also have a Gigsberg button', value: tmGb, view: 'with_gigsberg', hint: pct(tmGb, tmOn) },
        { label: 'Also have a See Tickets button', value: tmSt, view: 'with_see_tickets', hint: pct(tmSt, tmOn) },
      ],
    },
    {
      key: 'gigsberg', label: 'Gigsberg', blurb: 'Resale tickets across 40 UK cities. Linked to our events; shows we lack are imported.', lastRefresh: gbAt, lastImport,
      metrics: [
        { label: 'Shows on Gigsberg (UK, upcoming)', value: gbAll, view: 'all' },
        { label: 'Linked to a site event', value: gbLinked, view: 'linked', tone: 'good', hint: pct(gbLinked, gbAll) },
        { label: 'Need review (possible match)', value: gbReview, view: 'review', tone: gbReview ? 'warn' : 'good' },
        { label: 'Not on our site yet', value: gbUnlinked, view: 'unlinked', tone: gbUnlinked ? 'warn' : 'good' },
        { label: 'Site events with a Gigsberg button', value: gbOnSite, view: 'on_site' },
        { label: 'Events created from Gigsberg', value: gbCreated, view: 'created' },
        { label: 'No longer on Gigsberg (removed)', value: gbGone, view: 'gone' },
      ],
    },
    {
      key: 'see_tickets', label: 'See Tickets', blurb: 'Primary tickets feed. Linked to our events; shows we lack are imported.', lastRefresh: stAt, lastImport,
      metrics: [
        { label: 'Shows in the See Tickets feed', value: stAll, view: 'all' },
        { label: 'Linked to a site event', value: stLinked, view: 'linked', tone: 'good', hint: pct(stLinked, stAll) },
        { label: 'Need review (possible match)', value: stReview, view: 'review', tone: stReview ? 'warn' : 'good' },
        { label: 'Not on our site yet', value: stUnlinked, view: 'unlinked', tone: stUnlinked ? 'warn' : 'good' },
        { label: 'Site events with a See Tickets button', value: stOnSite, view: 'on_site' },
        { label: 'Events created from See Tickets', value: stCreated, view: 'created' },
        { label: 'No longer in the feed (removed)', value: stGone, view: 'gone' },
      ],
    },
    {
      key: 'council', label: 'Council events (Derby)', blurb: 'Derby LIVE and Market Hall listings.', lastRefresh: cAt, lastImport: null,
      metrics: [{ label: 'Events on the site', value: cOn, view: 'all' }],
    },
  ]
}
