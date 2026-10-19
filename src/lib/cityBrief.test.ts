import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildEdition, editionHeadline, freshnessStamp, stalestSync, type EditionEvent } from './cityBrief.ts'

const now = new Date('2026-10-20T08:00:00Z')   // 09:00 BST on Tue 20 Oct
let n = 0
const ev = (title: string, start: string, extra: Partial<EditionEvent> = {}): EditionEvent => ({
  id: `e${++n}`, title, slug: `s${n}`, start_date: start, status: 'on_sale', image_url: 'x.jpg', category: 'concert', venue_name: 'Bath Forum', ...extra,
})
const empty = { now, today: [], soon: [], onSaleToday: [], presaleOpen: [], fresh: [], upcoming: [] }

describe('cityBrief', () => {
  test('tonight comes first, then today on-sales, presales, new, week', () => {
    const tonight = ev('Band A', '2026-10-20T18:30:00Z')
    const onsale = ev('Band B', '2026-12-01T19:00:00Z')
    const presale = ev('Band C', '2026-12-02T19:00:00Z')
    const fresh = ev('Band D', '2026-12-03T19:00:00Z')
    const soon = ev('Band E', '2026-10-22T19:00:00Z')
    const tiles = buildEdition({ ...empty, today: [tonight], onSaleToday: [onsale], presaleOpen: [presale], fresh: [fresh], soon: [soon] })
    assert.deepEqual(tiles.map(t => t.kind), ['tonight', 'onsale_today', 'presale_live', 'new', 'soon'])
    assert.equal(tiles[0].when, 'Tonight · 19:30')
  })

  test('one tile per show, packages and cancelled shows dropped', () => {
    const a = ev('Band A', '2026-10-22T19:00:00Z')
    const again = ev('Band A', '2026-10-23T19:00:00Z')
    const pkg = ev('Band A - VIP Premium Package', '2026-10-22T19:00:00Z')
    const cancelled = ev('Band Z', '2026-10-22T19:00:00Z', { status: 'cancelled' })
    const tiles = buildEdition({ ...empty, soon: [a, again, pkg, cancelled] })
    assert.equal(tiles.length, 1)
    assert.equal(tiles[0].event.id, a.id)
  })

  test('an event already finished tonight is not shown as tonight', () => {
    const done = ev('Early', '2026-10-20T10:00:00Z', { end_date: '2026-10-20T07:00:00Z' })
    assert.equal(buildEdition({ ...empty, today: [done] }).length, 0)
  })

  test('a quiet week falls back to what is coming up', () => {
    const next = [ev('Far A', '2026-11-05T19:00:00Z'), ev('Far B', '2026-11-06T19:00:00Z')]
    const tiles = buildEdition({ ...empty, upcoming: next })
    assert.ok(tiles.length >= 2)
    assert.ok(tiles.every(t => t.kind === 'next_up'))
  })

  test('headline uses real counts and degrades honestly', () => {
    assert.equal(editionHeadline({ cityName: 'Bath', tonight: 2, onSaleToday: 1, presaleLive: 0, thisWeek: 4, next: null }), 'Bath today: 2 shows tonight, 1 show on sale today')
    assert.equal(editionHeadline({ cityName: 'Bath', tonight: 0, onSaleToday: 0, presaleLive: 0, thisWeek: 4, next: null }), 'Bath today: 4 shows in the next 7 days')
    assert.match(editionHeadline({ cityName: 'Bath', tonight: 0, onSaleToday: 0, presaleLive: 0, thisWeek: 0, next: { title: 'Band Q', start_date: '2026-10-31T19:00:00Z' } }), /^Quiet week in Bath\. Next up: Band Q/)
    assert.equal(editionHeadline({ cityName: 'Bath', tonight: 0, onSaleToday: 0, presaleLive: 0, thisWeek: 0, next: null }), "What's on in Bath")
  })

  test('freshness stamp only appears when the data really is fresh', () => {
    assert.equal(freshnessStamp('2026-10-20T05:12:00Z', now), 'Updated 06:12 today')
    assert.equal(freshnessStamp('2026-10-19T22:00:00Z', now), 'Updated yesterday 23:00')
    assert.equal(freshnessStamp('2026-10-10T05:12:00Z', now), null)
    assert.equal(freshnessStamp(null, now), null)
  })

  test('stalestSync is the oldest refresh and blank if any show was never refreshed', () => {
    assert.equal(stalestSync([{ last_synced_at: '2026-10-20T05:00:00Z' }, { last_synced_at: '2026-10-19T01:00:00Z' }]), '2026-10-19T01:00:00Z')
    assert.equal(stalestSync([{ last_synced_at: '2026-10-20T05:00:00Z' }, { last_synced_at: null }]), null)
    assert.equal(stalestSync([]), null)
  })
})
