import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateImports, importVerdict, describeRun } from './importStatus.ts'

const now = new Date('2026-10-20T08:00:00Z')
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
const run = (job: string, hoursAgo: number, status = 'ok', summary: unknown = { success: true }, error: string | null = null) =>
  ({ job, started_at: ago(hoursAgo), finished_at: ago(hoursAgo), status, summary, error })

const allOk = [
  run('sync-ticketmaster-sweep', 3), run('sync-onsale', 5), run('sync-see-tickets', 2), run('match-see-tickets', 2),
  run('sync-gigsberg-sweep', 3), run('match-gigsberg', 4), run('sync-gigsberg', 6), run('sync-council-events', 2), run('sync-city-news', 4),
]
const fresh = { ticketmaster: ago(2), see_tickets: ago(2), gigsberg: ago(3), council: ago(2), news: ago(4) }
const live = { ticketmaster: 'live', gigsberg: 'live', see_tickets: 'dry', council: 'dry' } as const
const card = (cards: ReturnType<typeof evaluateImports>, key: string) => cards.find(c => c.key === key)!

describe('evaluateImports', () => {
  test('everything ran recently, data is fresh, sweeps live: all done', () => {
    const cards = evaluateImports({ runs: allOk, modes: live, proof: fresh, now })
    assert.ok(cards.every(c => c.state === 'done'), JSON.stringify(cards.map(c => [c.key, c.state, c.headline])))
    assert.equal(importVerdict(cards).ok, true)
  })

  test('a failed job makes its source failed and names it', () => {
    const runs = [...allOk.filter(r => r.job !== 'match-see-tickets'), run('match-see-tickets', 1, 'error', null, 'HTTP 504')]
    const c = card(evaluateImports({ runs, modes: live, proof: fresh, now }), 'see_tickets')
    assert.equal(c.state, 'failed')
    assert.match(c.headline, /Linking to events/)
    assert.match(c.jobs[1].outcome, /504/)
  })

  test('a run stuck "running" for over 12 minutes counts as failed', () => {
    const runs = [...allOk.filter(r => r.job !== 'match-see-tickets'), { job: 'match-see-tickets', started_at: ago(3), finished_at: null, status: 'running', summary: null }]
    assert.equal(card(evaluateImports({ runs, modes: live, proof: fresh, now }), 'see_tickets').state, 'failed')
  })

  test('job reported OK but the data is days old: not done (this is the Gigsberg 13 Oct case)', () => {
    const c = card(evaluateImports({ runs: allOk, modes: live, proof: { ...fresh, gigsberg: ago(24 * 7) }, now }), 'gigsberg')
    assert.equal(c.state, 'stale')
    assert.match(c.notes.join(' '), /refreshed 168h ago/)
  })

  test('a dry Gigsberg/Ticketmaster sweep saves nothing, so it is not done; dry See Tickets/council still is', () => {
    const cards = evaluateImports({ runs: allOk, modes: { ...live, gigsberg: 'dry' }, proof: fresh, now })
    assert.equal(card(cards, 'gigsberg').state, 'stale')
    assert.match(card(cards, 'gigsberg').headline, /dry mode/)
    assert.equal(card(cards, 'see_tickets').state, 'done')
    assert.equal(card(cards, 'council').state, 'done')
  })

  test('no run in the allowed window is overdue; no run at all is never', () => {
    const runs = allOk.filter(r => r.job !== 'sync-city-news')
    assert.equal(card(evaluateImports({ runs, modes: live, proof: fresh, now }), 'news').state, 'stale')
    const old = [...runs, run('sync-city-news', 40)]
    assert.equal(card(evaluateImports({ runs: old, modes: live, proof: { ...fresh, news: ago(40) }, now }), 'news').jobs[0].state, 'overdue')
  })

  test('switched off is reported as off', () => {
    assert.equal(card(evaluateImports({ runs: allOk, modes: { ...live, council: 'off' }, proof: fresh, now }), 'council').state, 'off')
  })

  test('verdict lists what needs attention', () => {
    const v = importVerdict(evaluateImports({ runs: allOk, modes: { ...live, gigsberg: 'dry' }, proof: fresh, now }))
    assert.equal(v.ok, false)
    assert.match(v.line, /Gigsberg/)
  })
})

describe('describeRun', () => {
  test('Gigsberg sweep says plainly when nothing was saved', () => {
    const t = describeRun('sync-gigsberg-sweep', { success: true, sweep: { mode: 'dry', stats: { seen: 3483, cities: 40, inserted: 184, updated: 2074 } } })
    assert.match(t, /3,483 shows seen across 40 cities, 184 new, 2,074 updated \(DRY: not saved\)/)
  })
  test('See Tickets feed', () => {
    assert.match(describeRun('sync-see-tickets', { success: true, fetched: 14434, eligible: 13401, inserted: 120, updated: 300, sweep: { mode: 'dry', removed: 0, absentFromFeed: 259 } }), /14,434 feed rows, 13,401 UK in range, 120 new, 300 updated, dead-show check dry: 0 removed, 259 missing/)
  })
  test('matching, news, council, failure', () => {
    assert.match(describeRun('match-gigsberg', { checked: 1604, autoMatched: 76, review: 152, noMatch: 1376, errors: 0 }), /1,604 checked, 76 newly linked/)
    assert.match(describeRun('sync-city-news', { errors: 0, perCity: [{ fetched: 8 }, { fetched: 6 }] }), /14 stories fetched across 2 cities/)
    assert.match(describeRun('sync-council-events', { sources: [{ found: 17, inserted: 11 }, { found: 26, inserted: 19 }] }), /43 events found, 30 new or updated/)
    assert.match(describeRun('sync-see-tickets', { success: false, error: 'feed 500' }), /Failed: feed 500/)
  })
})
