import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildEdition, editionHeadline, freshnessStamp, stalestSync, londonDayWithYear, type EditionEvent } from './cityBrief.ts'

const now = new Date('2026-10-20T08:00:00Z')   // 09:00 BST on Tue 20 Oct
let n = 0
const ev = (title: string, start: string, extra: Partial<EditionEvent> = {}): EditionEvent => ({
  id: `e${++n}`, title, slug: `s${n}`, start_date: start, status: 'on_sale', image_url: 'x.jpg', category: 'concert', venue_name: 'Bath Forum', ...extra,
})
const empty = { now, onSaleToday: [], onSaleWeek: [], presaleOpen: [], top: [] }

describe('cityBrief', () => {
  test('on sale first (biggest venue leads), then presale, then top events', () => {
    const small = ev('Band B', '2026-12-01T19:00:00Z', { venue_capacity: 300 })
    const big = ev('Jimmy Carr', '2026-10-29T18:00:00Z', { venue_capacity: 3000 })
    const today = ev('Band T', '2026-12-05T19:00:00Z', { venue_capacity: 100 })
    const presale = ev('Band C', '2026-12-02T19:00:00Z')
    const top = [ev('Arena Act', '2026-11-20T19:00:00Z', { venue_name: 'Arena' })]
    const tiles = buildEdition({ ...empty, onSaleToday: [today], onSaleWeek: [small, big], presaleOpen: [presale], top })
    assert.deepEqual(tiles.map(t => t.kind), ['onsale_today', 'onsale_week', 'onsale_week', 'presale_live', 'top'])
    assert.equal(tiles[1].event.title, 'Jimmy Carr')
    assert.equal(tiles[1].label, 'On sale this week')
  })

  test('events merely happening this week are not a category: only on-sale and top shows appear', () => {
    const tiles = buildEdition({ ...empty, top: [ev('Big Show', '2026-10-22T19:00:00Z')] })
    assert.deepEqual(tiles.map(t => t.kind), ['top'])
    assert.equal(tiles[0].label, 'Top event')
  })

  test('a show on sale is not repeated as a top event', () => {
    const jc = ev('Jimmy Carr', '2026-10-29T18:00:00Z')
    const jcTop = { ...jc }
    const tiles = buildEdition({ ...empty, onSaleWeek: [jc], top: [jcTop, ev('Other', '2026-11-01T19:00:00Z')] })
    assert.equal(tiles.filter(t => t.event.title === 'Jimmy Carr').length, 1)
  })

  test('one tile per show, packages and cancelled shows dropped', () => {
    const a = ev('Band A', '2026-10-22T19:00:00Z')
    const again = ev('Band A', '2026-10-23T19:00:00Z')
    const pkg = ev('Band A - VIP Premium Package', '2026-10-22T19:00:00Z')
    const cancelled = ev('Band Z', '2026-10-22T19:00:00Z', { status: 'cancelled' })
    const tiles = buildEdition({ ...empty, onSaleWeek: [a, again, pkg, cancelled] })
    assert.equal(tiles.length, 1)
    assert.equal(tiles[0].event.id, a.id)
  })

  test('timed-entry attractions never become tiles', () => {
    const real = ev('Alison Moyet', '2026-10-20T18:30:00Z')
    const tussauds = ev('Madame Tussauds Blackpool - Standard Entry', '2026-10-20T09:00:00Z', { venue_name: 'Madame Tussauds Blackpool' })
    const park = ev('Blackpool Sandcastle Waterpark', '2026-10-20T09:00:00Z', { venue_name: 'Sandcastle Waterpark, Blackpool' })
    const tiles = buildEdition({ ...empty, top: [tussauds, park, real] })
    assert.deepEqual(tiles.map(t => t.event.title), ['Alison Moyet'])
  })

  test('no venue supplies more than two top-event tiles', () => {
    const top = ['A', 'B', 'C', 'D'].map(t => ev(`Act ${t}`, '2026-11-10T19:00:00Z', { venue_name: 'Arena' }))
    assert.equal(buildEdition({ ...empty, top }).length, 2)
  })

  test('on-sale shows are capped at four so top events always get room', () => {
    const onSaleWeek = ['A', 'B', 'C', 'D', 'E', 'F'].map(t => ev(`On ${t}`, '2026-12-10T19:00:00Z', { venue_name: `V${t}` }))
    const top = ['X', 'Y', 'Z'].map(t => ev(`Top ${t}`, '2026-11-10T19:00:00Z', { venue_name: `W${t}` }))
    const tiles = buildEdition({ ...empty, onSaleWeek, top })
    assert.equal(tiles.filter(t => t.kind === 'onsale_week').length, 4)
    assert.equal(tiles.filter(t => t.kind === 'top').length, 3)
  })

  test('headline uses real counts and degrades honestly', () => {
    assert.equal(editionHeadline({ cityName: 'Derby', onSaleThisWeek: 3, presaleLive: 0 }), 'Derby: top events, 3 shows on sale this week')
    assert.equal(editionHeadline({ cityName: 'Derby', onSaleThisWeek: 1, presaleLive: 2 }), 'Derby: top events, 1 show on sale this week, 2 presales open')
    assert.equal(editionHeadline({ cityName: 'Derby', onSaleThisWeek: 0, presaleLive: 0 }), 'Top events in Derby')
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

describe('londonDayWithYear', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  test('a show in the current year has no year, as before', () => {
    assert.equal(londonDayWithYear('2026-10-29T18:00:00Z', now), 'Thu 29 Oct')
  })
  test('a show next year says so: Jimmy Carr 29 Oct 2027 must not read as this month', () => {
    assert.equal(londonDayWithYear('2027-10-29T17:00:00Z', now), 'Fri 29 Oct 2027')
  })
})
