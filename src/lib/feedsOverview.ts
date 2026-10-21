// Numbers for the admin "Feeds & matching" page: how many live future site events carry each combination of feed
// buttons, and whether our affiliate tracking is actually on the buttons. Admin client only.
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import {
  getEventimAffiliateLink, getEventbriteAffiliateLink, getGigsbergAffiliateLink, getSeatUniqueAffiliateLink, getSeeTicketsAffiliateLink,
  getSkiddleAffiliateLink, getStubHubAffiliateLink, getTicketmasterAffiliateLink, getViagogoAffiliateLink, getVividSeatsAffiliateLink,
} from '@/lib/affiliate'

export interface Combo { key: string; label: string; tm: boolean; gb: boolean; st: boolean; hint: string }

/** Every combination of the three feeds a site event can carry. TM = came from / is linked to Ticketmaster. */
export const COMBOS: Combo[] = [
  { key: 'all3',    label: 'On all 3 feeds',                 tm: true,  gb: true,  st: true,  hint: 'Ticketmaster, Gigsberg and See Tickets buttons' },
  { key: 'tm_gb',   label: 'Ticketmaster + Gigsberg',        tm: true,  gb: true,  st: false, hint: 'Could See Tickets have it too?' },
  { key: 'tm_st',   label: 'Ticketmaster + See Tickets',     tm: true,  gb: false, st: true,  hint: 'Could Gigsberg have it too? (resale backup if it sells out)' },
  { key: 'gb_st',   label: 'Gigsberg + See Tickets',         tm: false, gb: true,  st: true,  hint: 'Not on Ticketmaster' },
  { key: 'tm_only', label: 'Ticketmaster only',              tm: true,  gb: false, st: false, hint: 'No Gigsberg or See Tickets button yet' },
  { key: 'gb_only', label: 'Gigsberg only',                  tm: false, gb: true,  st: false, hint: 'Created from Gigsberg' },
  { key: 'st_only', label: 'See Tickets only',               tm: false, gb: false, st: true,  hint: 'Created from See Tickets' },
  { key: 'none',    label: 'No feed button',                 tm: false, gb: false, st: false, hint: 'Council / hand-added events' },
]

export type OverlapCounts = Record<string, number> & { total: number }

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadOverlap(): Promise<OverlapCounts | null> {
  const { data, error } = await (createAdminClient() as Loose).rpc('feed_overlap')
  if (error || !data) return null
  return data as OverlapCounts
}

/** Applies a combination to a query on `events`. */
export function applyCombo<Q extends { not: Function; is: Function }>(query: Q, combo: Combo): Q { // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  let q: Q = query
  q = combo.tm ? q.not('ticketmaster_id', 'is', null) : q.is('ticketmaster_id', null)
  q = combo.gb ? q.not('gigsberg_affiliate_url', 'is', null) : q.is('gigsberg_affiliate_url', null)
  q = combo.st ? q.not('see_tickets_affiliate_url', 'is', null) : q.is('see_tickets_affiliate_url', null)
  return q
}

export interface AffiliateAudit {
  tm_links: number; tm_wrong_host: number; tm_other_hosts: Array<{ host: string; n: number }>
  gb_links: number; gb_wrong_host: number; gb_other_aff: number
  st_links: number; st_wrong_host: number
  no_button_at_all: number
}

export async function loadAffiliateAudit(): Promise<AffiliateAudit | null> {
  const { data, error } = await (createAdminClient() as Loose).rpc('affiliate_link_audit')
  if (error || !data) return null
  return data as AffiliateAudit
}

export interface LinkSample { provider: string; slug: string; stored: string; final: string; tracked: boolean; how: string }

/** Builds the real outgoing link for one real event per provider, with the same functions the event page uses. */
export async function loadLinkSamples(): Promise<LinkSample[]> {
  const db = createAdminClient() as Loose
  const base = () => db.from('events').select('slug, tickets_url, gigsberg_affiliate_url, see_tickets_affiliate_url').gte('start_date', new Date().toISOString()).in('status', LIVE_EVENT_STATUSES).limit(1)
  const [tm, gb, st] = await Promise.all([
    base().not('tickets_url', 'is', null).like('tickets_url', '%ticketmaster.co.uk%'),
    base().not('gigsberg_affiliate_url', 'is', null),
    base().not('see_tickets_affiliate_url', 'is', null),
  ])
  const out: LinkSample[] = []
  const t = tm.data?.[0]
  if (t) {
    const final = getTicketmasterAffiliateLink(t.tickets_url, `evt-${t.slug}`)
    out.push({ provider: 'Ticketmaster', slug: t.slug, stored: t.tickets_url, final, tracked: final.startsWith('https://ticketmaster.evyy.net/c/'), how: 'Own /out/tm hop (bots filtered out) that forwards to the Impact tracking link (ticketmaster.evyy.net)' })
  }
  const g = gb.data?.[0]
  if (g) {
    const final = getGigsbergAffiliateLink(g.gigsberg_affiliate_url)
    let tracked = false
    try { tracked = new URL(final).searchParams.get('aff') === 'showfinder' } catch { /* not a URL */ }
    out.push({ provider: 'Gigsberg', slug: g.slug, stored: g.gigsberg_affiliate_url, final, tracked, how: 'aff=showfinder on the Gigsberg link' })
  }
  const s = st.data?.[0]
  if (s) {
    const final = getSeeTicketsAffiliateLink(s.see_tickets_affiliate_url, `evt-${s.slug}`)
    out.push({ provider: 'See Tickets', slug: s.slug, stored: s.see_tickets_affiliate_url, final, tracked: /(^|\.)awin1\.com/i.test(new URL(final).hostname), how: 'Awin tracking link (awin1.com)' })
  }
  return out
}

export interface ProviderStatus { provider: string; envVar: string | null; tracked: boolean; note: string }

/** Which providers' buttons carry tracking. Only whether an env var is set is reported, never its value. */
export function providerStatuses(): ProviderStatus[] {
  const probe = (fn: (u: string) => string, url: string) => fn(url) !== url
  return [
    { provider: 'Ticketmaster', envVar: null, tracked: true, note: 'Impact, built in' },
    { provider: 'See Tickets', envVar: null, tracked: true, note: 'Awin, built in' },
    { provider: 'Gigsberg', envVar: null, tracked: true, note: 'aff=showfinder, built in' },
    { provider: 'Viagogo', envVar: 'VIAGOGO_AFFILIATE_TEMPLATE', tracked: probe(getViagogoAffiliateLink, 'https://www.viagogo.co.uk/x'), note: 'needs the Partnerize template in Vercel' },
    { provider: 'StubHub', envVar: 'STUBHUB_AFFILIATE_TEMPLATE', tracked: probe(getStubHubAffiliateLink, 'https://www.stubhub.co.uk/x'), note: 'not applied for yet' },
    { provider: 'Eventim', envVar: 'EVENTIM_AFFILIATE_TEMPLATE', tracked: probe(getEventimAffiliateLink, 'https://www.eventim.co.uk/x'), note: 'not applied for yet' },
    { provider: 'Vivid Seats', envVar: 'VIVIDSEATS_AFFILIATE_TEMPLATE', tracked: probe(getVividSeatsAffiliateLink, 'https://www.vividseats.com/x'), note: 'Impact, being signed up' },
    { provider: 'Eventbrite', envVar: 'EVENTBRITE_AFFILIATE_TEMPLATE', tracked: probe(getEventbriteAffiliateLink, 'https://www.eventbrite.co.uk/x'), note: 'not applied for yet' },
    { provider: 'Skiddle', envVar: 'SKIDDLE_AFFILIATE_TEMPLATE', tracked: probe(getSkiddleAffiliateLink, 'https://www.skiddle.com/x'), note: 'not applied for yet' },
    { provider: 'Seat Unique', envVar: 'SEATUNIQUE_AFFILIATE_TEMPLATE', tracked: probe(getSeatUniqueAffiliateLink, 'https://www.seatunique.com/x'), note: 'not applied for yet' },
  ]
}

export interface FeedProgress {
  platform: 'gigsberg' | 'see_tickets'
  label: string
  total: number | null      // live, future shows in the feed
  linked: number | null     // linked to a site event (matched or created from the feed)
  waiting: number | null    // not checked by the matcher yet
  noMatch: number | null    // matcher checked: nothing on the site looks like it
  review: number | null     // matcher unsure: needs a human
  hidden: number | null     // you marked it "not on our site"
}

const FEED_TABLES: Array<{ platform: FeedProgress['platform']; label: string; table: string }> = [
  { platform: 'gigsberg', label: 'Gigsberg', table: 'gigsberg_catalogue_events' },
  { platform: 'see_tickets', label: 'See Tickets', table: 'see_tickets_catalogue_events' },
]

/** For each feed: how many shows it holds and how far matching has got. Head counts only. */
export async function loadFeedProgress(): Promise<FeedProgress[]> {
  const db = createAdminClient() as Loose
  const today = new Date().toISOString().slice(0, 10)
  const base = (table: string) => db.from(table).select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', today)
  const n = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> => {
    try { const r = await q; return r.error ? null : r.count } catch { return null }
  }
  return Promise.all(FEED_TABLES.map(async ({ platform, label, table }) => {
    const [total, linked, waiting, noMatch, review, hidden] = await Promise.all([
      n(base(table)),
      n(base(table).not('matched_event_id', 'is', null)),
      n(base(table).is('matched_event_id', null).or('match_status.is.null,match_status.eq.pending')),
      n(base(table).is('matched_event_id', null).eq('match_status', 'no_match')),
      n(base(table).is('matched_event_id', null).eq('match_status', 'review')),
      n(base(table).is('matched_event_id', null).eq('match_status', 'rejected')),
    ])
    return { platform, label, total, linked, waiting, noMatch, review, hidden }
  }))
}
