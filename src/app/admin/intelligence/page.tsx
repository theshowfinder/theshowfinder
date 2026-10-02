export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { NATIONAL_NAME } from '@/lib/cityNews'
import { summarizeFeedHealth, feedsNeedingAttention, type SyncLogRow } from '@/lib/feedHealth'
import { checkOnSaleLinkHealth, type LinkHealthReport } from '@/lib/linkHealth'
import {
  resolveCityNewsTargets,
  candidateAttentionReasons,
  type NewsCandidateAttentionReason,
} from '@/lib/newsPublishing'
import {
  londonDayWindow,
  londonDaysAheadWindow,
  hasNoUsableTicketLink,
  findBareProviderHomepages,
  isStaleUpcomingEvent,
  isCancelledOrPostponedButUpcoming,
  wasRecentlyChanged,
  isMajorTourAnnouncement,
  summarizeNewsQueue,
  newsCandidateDashboardStatus,
  classifyStaleEventsContext,
  STALE_SYNC_THRESHOLD_MS,
  type IntelligenceItemStatus,
  type BareHomepageFinding,
} from '@/lib/intelligence'
import type { Artist, NewsCandidate } from '@/lib/types/database'

// ── Row shapes (narrow selects, matching the established admin-page
//    pattern in src/app/admin/events/page.tsx rather than pulling the
//    full generated Event/Venue row types). ─────────────────────────────

interface VenueRef { name: string; city: string }

interface DashboardEventRow {
  id:             string
  title:          string
  slug:           string
  start_date:     string
  onsale_date:    string | null
  presale_start:  string | null
  presale_name:   string | null
  status:         string
  tickets_url:    string | null
  own_ticket_url: string | null
  last_synced_at: string | null
  ticketmaster_id: string | null
  updated_at:     string
  created_at:     string
  venue:          VenueRef | null
}

interface SyncStateRow {
  status:               string | null
  last_started_at:      string | null
  last_completed_at:    string | null
  total_events_synced:  number | null
}

const EVENT_SELECT =
  'id, title, slug, start_date, onsale_date, presale_start, presale_name, status, tickets_url, own_ticket_url, last_synced_at, ticketmaster_id, updated_at, created_at, venue:venues(name, city)'

function fmt(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: '2-digit',
  })
}

const STATUS_BADGE: Record<IntelligenceItemStatus, { label: string; classes: string }> = {
  discovered:   { label: 'Discovered',   classes: 'bg-slate-100 text-slate-600' },
  needs_review: { label: 'Needs review', classes: 'bg-amber-100 text-amber-700' },
  approved:     { label: 'Approved',     classes: 'bg-blue-100 text-blue-700' },
  published:    { label: 'Published',    classes: 'bg-green-100 text-green-700' },
  blocked:      { label: 'Blocked',      classes: 'bg-red-100 text-red-700' },
}

const ATTENTION_LABEL: Record<NewsCandidateAttentionReason, string> = {
  no_destination:         'No publishing destination',
  stale_pending:          'Pending 2+ days',
  approved_not_published: 'Approved, not published 24h+',
  ai_suggestion_failed:   'AI suggestion failed',
  blocked_test_content:   'Blocked: test/internal content',
  not_visible:            'Published but not visible',
}

function StatusBadge({ status }: { status: IntelligenceItemStatus }) {
  const s = STATUS_BADGE[status]
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${s.classes}`}>{s.label}</span>
}

function SectionCard({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 scroll-mt-20">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-slate-400 py-2">{label}</p>
}

function EventList({ events, note }: { events: DashboardEventRow[]; note?: (e: DashboardEventRow) => string | null }) {
  if (events.length === 0) return <Empty label="Nothing here." />
  return (
    <ul className="divide-y divide-slate-100">
      {events.map(e => {
        const extra = note?.(e) ?? null
        return (
          <li key={e.id} className="py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/admin/events/${e.slug}`} className="font-semibold text-slate-900 hover:underline truncate block">
                {e.title}
              </Link>
              <p className="text-xs text-slate-400">
                {e.venue ? `${e.venue.name}, ${e.venue.city}` : 'No venue'} · {fmtDate(e.start_date)}
                {extra && <span className="text-amber-600"> · {extra}</span>}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default async function IntelligenceDashboardPage() {
  await requireAdmin()
  const db = createAdminClient()

  const now = new Date()
  const nowMs = now.getTime()
  const today = londonDayWindow(now)
  const next7 = londonDaysAheadWindow(now, 7)
  const recentChangeCutoffISO = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString()

  // ── Independent queries, run in parallel ────────────────────────────
  const [
    artistsResult,
    onSaleTodayResult,
    presaleTodayResult,
    startingTodayResult,
    onSaleNext7Result,
    presaleNext7Result,
    recentlyChangedResult,
    upcomingQualityResult,
    newsCandidatesResult,
    syncStateResult,
    syncLogResult,
  ] = await Promise.all([
    db.from('artists').select('*').order('name', { ascending: true }) as unknown as Promise<{ data: Artist[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('onsale_date', today.startISO).lt('onsale_date', today.endISO).order('onsale_date', { ascending: true }).limit(100) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('presale_start', today.startISO).lt('presale_start', today.endISO).order('presale_start', { ascending: true }).limit(100) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('start_date', today.startISO).lt('start_date', today.endISO).order('start_date', { ascending: true }).limit(100) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('onsale_date', today.startISO).lt('onsale_date', next7.endISO).order('onsale_date', { ascending: true }).limit(200) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('presale_start', today.startISO).lt('presale_start', next7.endISO).order('presale_start', { ascending: true }).limit(200) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('updated_at', recentChangeCutoffISO).order('updated_at', { ascending: false }).limit(100) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('events').select(EVENT_SELECT).gte('start_date', now.toISOString()).order('start_date', { ascending: true }).limit(500) as unknown as Promise<{ data: DashboardEventRow[] | null }>,
    db.from('news_candidates').select('*').order('discovered_at', { ascending: false }).limit(300) as unknown as Promise<{ data: NewsCandidate[] | null }>,
    db.from('sync_state').select('status, last_started_at, last_completed_at, total_events_synced').eq('id', 1).maybeSingle() as unknown as Promise<{ data: SyncStateRow | null }>,
    db.from('sync_log').select('city, started_at, completed_at, events_synced, status, error').in('city', [...CITIES.map(c => c.name), NATIONAL_NAME]).order('started_at', { ascending: false }).limit(600) as unknown as Promise<{ data: SyncLogRow[] | null }>,
  ])

  const artists = artistsResult.data ?? []
  const onSaleToday = onSaleTodayResult.data ?? []
  const presaleToday = presaleTodayResult.data ?? []
  const startingToday = startingTodayResult.data ?? []
  const onSaleNext7 = onSaleNext7Result.data ?? []
  const presaleNext7 = presaleNext7Result.data ?? []
  const recentlyChangedRaw = recentlyChangedResult.data ?? []
  const upcomingQuality = upcomingQualityResult.data ?? []
  const allCandidates = newsCandidatesResult.data ?? []
  const syncState = syncStateResult.data
  const syncLog = syncLogResult.data ?? []

  // ── News candidate target cities (one extra query, same pattern as
  //    /admin/news) ────────────────────────────────────────────────────
  const { data: cityRowsRaw } = allCandidates.length
    ? await db
        .from('news_candidate_cities')
        .select('candidate_id, city_slug, city_name')
        .in('candidate_id', allCandidates.map(c => c.id)) as unknown as { data: { candidate_id: string; city_slug: string; city_name: string }[] | null }
    : { data: [] as { candidate_id: string; city_slug: string; city_name: string }[] }

  const citiesByCandidate = new Map<string, { city_slug: string; city_name: string }[]>()
  for (const row of cityRowsRaw ?? []) {
    const list = citiesByCandidate.get(row.candidate_id) ?? []
    list.push({ city_slug: row.city_slug, city_name: row.city_name })
    citiesByCandidate.set(row.candidate_id, list)
  }

  const candidatesWithTargets = allCandidates.map(c => {
    const targets = resolveCityNewsTargets(c, citiesByCandidate.get(c.id) ?? [])
    const hasNoDestination = targets.length === 0
    const reasons = candidateAttentionReasons(c, hasNoDestination, nowMs)
    const status = newsCandidateDashboardStatus(c, reasons.includes('no_destination') || reasons.includes('blocked_test_content'))
    return { candidate: c, targets, hasNoDestination, reasons, status }
  })

  const targetsByCandidateId = new Map(candidatesWithTargets.map(x => [x.candidate.id, x]))
  const queueCounts = summarizeNewsQueue(
    allCandidates,
    c => targetsByCandidateId.get((c as NewsCandidate).id)?.hasNoDestination ?? true,
  )

  const pending = candidatesWithTargets.filter(x => x.candidate.review_status === 'pending')
  const needingAttention = candidatesWithTargets.filter(x => x.reasons.length > 0)

  // Most urgent single candidate for the "Review a news candidate" quick
  // action — oldest high-priority pending row, else just the oldest
  // pending row (allCandidates is already newest-first, so reverse the
  // slice rather than re-sorting).
  const mostUrgentCandidate =
    [...pending].reverse().find(x => x.candidate.priority === 'high') ??
    [...pending].reverse()[0] ??
    null

  // ── Coming up: major tour announcements + recently changed events ──
  const majorTourArtists = artists.filter(a => isMajorTourAnnouncement(a, nowMs, next7.endISO))
  const recentlyChanged = recentlyChangedRaw.filter(e => wasRecentlyChanged(e, nowMs))

  // ── Quality checks ──────────────────────────────────────────────────
  const noUsableTicketLink = upcomingQuality.filter(hasNoUsableTicketLink)
  const staleEvents = upcomingQuality.filter(e => isStaleUpcomingEvent(e, nowMs))
  const cancelledUpcoming = upcomingQuality.filter(e => isCancelledOrPostponedButUpcoming(e, nowMs))
  const bareHomepages: BareHomepageFinding[] = findBareProviderHomepages(artists)

  let linkHealth: LinkHealthReport | null = null
  let linkHealthError: string | null = null
  try {
    linkHealth = await checkOnSaleLinkHealth(db, artists, CITIES.map(c => c.name))
  } catch (err) {
    linkHealthError = err instanceof Error ? err.message : 'Unknown error running the link-health check.'
  }

  const feedSummaries = summarizeFeedHealth([...CITIES.map(c => c.name), NATIONAL_NAME], syncLog, nowMs)
  const feedsAttention = feedsNeedingAttention(feedSummaries)
  const tmSyncStale = !syncState?.last_completed_at || nowMs - new Date(syncState.last_completed_at).getTime() > STALE_SYNC_THRESHOLD_MS
  // Distinguishes a genuine per-event data gap from transient "sync is
  // mid-run" noise or an actually-unhealthy sync job — see
  // classifyStaleEventsContext's own comment in intelligence.ts.
  const staleEventsContext = classifyStaleEventsContext(syncState, nowMs)

  const generatedAt = now.toLocaleString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Daily Intelligence</h1>
        <span className="text-xs text-slate-400 ml-auto">Updated {generatedAt} (Europe/London)</span>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <p className="text-sm text-slate-500">
          A morning briefing, not an automation panel — nothing on this page publishes, deletes, approves or sends anything
          on its own. Every action below links to the existing admin tools where you make the actual call.
        </p>

        {/* ── Quick actions ─────────────────────────────────────────── */}
        <SectionCard title="Quick actions">
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/news/from-url" className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              🔗 Add from URL
            </Link>
            <Link
              href={mostUrgentCandidate ? `/admin/news/${mostUrgentCandidate.candidate.id}` : '/admin/news'}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50"
            >
              📝 Review a news candidate{mostUrgentCandidate ? '' : ' (queue)'}
            </Link>
            <Link
              href={startingToday[0] ? `/admin/events/${startingToday[0].slug}` : '/admin/events'}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50"
            >
              🎫 Open today&rsquo;s event
            </Link>
            <Link href="#quality-checks" className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              🔍 Open link-health check
            </Link>
            <Link href="/admin/newsletter" className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              ✉️ Open newsletter workflow
            </Link>
          </div>
        </SectionCard>

        {/* ── Today ──────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">Today</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SectionCard title="Going on sale today">
              <EventList events={onSaleToday} />
            </SectionCard>
            <SectionCard title="Presales opening today">
              <EventList events={presaleToday} note={e => e.presale_name} />
            </SectionCard>
            <SectionCard title="Starting today">
              <EventList events={startingToday} />
            </SectionCard>
          </div>
        </div>

        {/* ── Coming up ──────────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">Coming up (next 7 days)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="On sale / presale in the next 7 days" subtitle={`${onSaleNext7.length} on sale, ${presaleNext7.length} presale`}>
              {onSaleNext7.length === 0 && presaleNext7.length === 0 ? <Empty label="Nothing in the next 7 days." /> : (
                <>
                  <EventList events={onSaleNext7.slice(0, 8)} />
                  {presaleNext7.length > 0 && <div className="mt-3 pt-3 border-t border-slate-100"><EventList events={presaleNext7.slice(0, 8)} /></div>}
                </>
              )}
            </SectionCard>
            <SectionCard title="Major tour announcements">
              {majorTourArtists.length === 0 ? <Empty label="No new or newly-notable tours." /> : (
                <ul className="divide-y divide-slate-100">
                  {majorTourArtists.slice(0, 10).map(a => (
                    <li key={a.id} className="py-2.5">
                      <Link href={`/admin/artists/${a.slug}`} className="font-semibold text-slate-900 hover:underline">{a.name}</Link>
                      <p className="text-xs text-slate-400">{a.tour_name ?? 'Tour'} · on sale {fmtDate(a.onsale_date)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
          <div className="mt-4">
            <SectionCard title="Recently changed events" subtitle="Date or ticket status edited in the last 48 hours">
              {recentlyChanged.length === 0 ? <Empty label="No recent changes." /> : <EventList events={recentlyChanged.slice(0, 10)} />}
            </SectionCard>
          </div>
        </div>

        {/* ── News queue ─────────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">News queue</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Pending', count: queueCounts.pending, href: '/admin/news?status=pending' },
              { label: 'High priority', count: queueCounts.highPriority, href: '/admin/news?priority=high' },
              { label: 'Unreviewed URL imports', count: queueCounts.unreviewedUrlImports, href: '/admin/news?provenance=url_import' },
              { label: 'AI awaiting review', count: queueCounts.aiAwaitingReview, href: '/admin/news' },
              { label: 'Missing destination', count: queueCounts.missingDestination, href: '/admin/news?attention=1' },
            ].map(c => (
              <Link key={c.label} href={c.href} className="bg-white rounded-xl border border-slate-200 p-3 hover:border-slate-300 transition-colors">
                <p className="text-2xl font-extrabold text-slate-900">{c.count}</p>
                <p className="text-xs text-slate-500">{c.label}</p>
              </Link>
            ))}
          </div>
          <SectionCard title="Needs attention" subtitle="Pending, stale, missing a destination, or a failed AI suggestion">
            {needingAttention.length === 0 ? <Empty label="Nothing needs attention right now." /> : (
              <ul className="divide-y divide-slate-100">
                {needingAttention.slice(0, 12).map(x => (
                  <li key={x.candidate.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/admin/news/${x.candidate.id}`} className="font-semibold text-slate-900 hover:underline truncate block">
                        {x.candidate.headline}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {x.reasons.map(r => ATTENTION_LABEL[r]).join(' · ')} · discovered {fmtDate(x.candidate.discovered_at)}
                      </p>
                    </div>
                    <StatusBadge status={x.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* ── Quality checks ─────────────────────────────────────────── */}
        <div id="quality-checks">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">Quality checks</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Events with no usable ticket link" subtitle={`${noUsableTicketLink.length} of ${upcomingQuality.length} upcoming`}>
              {noUsableTicketLink.length === 0 ? <Empty label="Every upcoming event has a ticket link." /> : <EventList events={noUsableTicketLink.slice(0, 10)} />}
            </SectionCard>

            <SectionCard title="Secondary links pointing only to provider homepages" subtitle="Artist-level links with no artist-specific search path">
              {bareHomepages.length === 0 ? <Empty label="No bare provider homepage links found on artists." /> : (
                <ul className="divide-y divide-slate-100">
                  {bareHomepages.slice(0, 10).map((f, i) => (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-semibold text-slate-900">{f.artistName}</span>
                      <span className="text-slate-400"> · {f.provider} link is a bare homepage</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-amber-600 mt-3 pt-3 border-t border-slate-100">
                Separate, code-level note: every event detail page also falls back to hardcoded Eventim and Skiddle homepage
                links when an event has no provider-specific URL (src/app/events/[slug]/page.tsx buildProviders()) — this is
                a fixed behaviour affecting every event without a dedicated link, not a per-row data issue, so it isn&rsquo;t
                counted in the list above.
              </p>
            </SectionCard>

            <SectionCard title="Broken internal links" subtitle="Cards linking to a slug that wouldn't actually resolve">
              {linkHealthError ? (
                <p className="text-sm text-red-600">Could not run the check: {linkHealthError}</p>
              ) : linkHealth && linkHealth.broken.length === 0 ? (
                <p className="text-sm text-green-700">✅ No broken internal links found ({linkHealth.checked} checked).</p>
              ) : linkHealth ? (
                <ul className="divide-y divide-slate-100">
                  {linkHealth.broken.slice(0, 10).map((b, i) => (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-semibold text-red-600">{b.url}</span>
                      <span className="text-slate-400"> · {b.surface}</span>
                    </li>
                  ))}
                  {linkHealth.broken.length > 10 && (
                    <li className="py-2 text-xs text-slate-400">+{linkHealth.broken.length - 10} more</li>
                  )}
                </ul>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Stale or missing event records"
              subtitle={
                staleEventsContext === 'sync_running'
                  ? 'Ticketmaster sync is running right now — stale counts below may just be events it hasn\u2019t reached yet this run.'
                  : staleEventsContext === 'sync_unhealthy'
                    ? 'The Ticketmaster sync itself hasn\u2019t completed successfully in 36h+ — treat everything below as suspect, not just these rows.'
                    : 'Sync is healthy and up to date — anything below is a genuine per-event gap (likely dropped from Ticketmaster\u2019s feed), worth checking individually.'
              }
            >
              {staleEvents.length === 0 && cancelledUpcoming.length === 0 ? <Empty label="Nothing stale or flagged." /> : (
                <>
                  {staleEvents.length > 0 && (
                    <EventList
                      events={staleEvents.slice(0, 6)}
                      note={() =>
                        staleEventsContext === 'sync_running'
                          ? 'not re-synced yet this run'
                          : staleEventsContext === 'sync_unhealthy'
                            ? 'not re-synced in 36h+ (sync itself unhealthy)'
                            : 'not re-synced in 36h+ despite a healthy sync'
                      }
                    />
                  )}
                  {cancelledUpcoming.length > 0 && <EventList events={cancelledUpcoming.slice(0, 6)} note={e => e.status} />}
                </>
              )}
            </SectionCard>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Ticketmaster sync">
              <p className={`text-sm font-semibold ${tmSyncStale ? 'text-amber-600' : 'text-green-700'}`}>
                {tmSyncStale ? '⚠ Stale or never completed' : '✅ Healthy'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Last completed: {fmt(syncState?.last_completed_at ?? null)} · Last started: {fmt(syncState?.last_started_at ?? null)} · Status: {syncState?.status ?? '—'}
                {typeof syncState?.total_events_synced === 'number' && ` · ${syncState.total_events_synced} events in last run`}
              </p>
            </SectionCard>

            <SectionCard title="RSS feed sync">
              {feedsAttention.length === 0 ? (
                <p className="text-sm text-green-700">✅ All {feedSummaries.length} feeds healthy</p>
              ) : (
                <p className="text-sm font-semibold text-amber-600">⚠ {feedsAttention.length} of {feedSummaries.length} feeds need attention</p>
              )}
              <Link href="/admin/news/feeds" className="text-xs text-blue-600 hover:underline mt-1 inline-block">Open RSS feed health →</Link>
            </SectionCard>
          </div>
        </div>
      </main>
    </div>
  )
}
