import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { decide, chooseEventUrl, overlap, type StRow, type StEvent } from './seeTicketsMatchRules.ts'

const row = (p: Partial<StRow>): StRow => ({ id: 'r1', name: 'Mica Paris', event_date: '2026-11-20', event_time: '19:30', venue: 'Pizza Express Live', city: 'London', primary_artist: null, second_artist: null, url: 'https://www.seetickets.com/event/x', ...p })
const ev = (id: string, title: string, start: string, venue = 'Pizza Express Live', city = 'London'): StEvent => ({ id, title, start_date: start, venue: { name: venue, city } })

describe('See Tickets matching', () => {
  test('the late show goes to the late-show event, not the early one', () => {
    const early = ev('early', 'Mica Paris (Early Show)', '2026-11-20T17:00:00Z')
    const late = ev('late', 'Mica Paris (Late Show)', '2026-11-20T19:45:00Z')
    const d = decide(row({ name: 'Mica Paris (Late Show)', event_time: '19:45' }), [early, late])
    assert.equal(d.status, 'auto_matched')
    assert.equal(d.best?.event.id, 'late')
  })
  test('one listing of the act that day is matched even if the feed time differs', () => {
    const d = decide(row({ name: 'Peter Kay', event_time: '19:00', venue: 'Brighton Centre', city: 'Brighton' }), [ev('pk', 'Peter Kay Live', '2026-11-20T19:30:00Z', 'Brighton Centre', 'Brighton')])
    assert.equal(d.status, 'auto_matched')
  })
  test('the exact show title wins a tie with another show by the same act', () => {
    const r = row({ name: 'Phil Wang: Uh Oh', primary_artist: 'Phil Wang', venue: 'De Montfort Hall', city: 'Leicester', event_time: '19:30' })
    const d = decide(r, [ev('other', 'Phil Wang: Wang in There, Baby!', '2026-11-20T19:30:00Z', 'De Montfort Hall', 'Leicester'), ev('uhoh', 'Phil Wang: UH OH', '2026-11-20T19:30:00Z', 'De Montfort Hall', 'Leicester')])
    assert.equal(d.status, 'auto_matched')
    assert.equal(d.best?.event.id, 'uhoh')
  })
  test('venue words all count: The Live Room@Caroline Social Club is The Live Room', () => {
    const d = decide(row({ name: 'Jim Moray', venue: 'The Live Room@Caroline Social Club', city: 'Shipley', event_time: '19:30' }), [ev('jm', 'Jim Moray', '2026-11-20T18:30:00Z', 'The Live Room', 'Saltaire')])
    assert.equal(d.status, 'auto_matched')
  })
  test('"The" alone is not a shared name', () => {
    assert.equal(overlap('The Rosadocs', 'The Teenagers'), 0)
    assert.equal(decide(row({ name: 'The Rosadocs' }), [ev('t', 'The Teenagers', '2026-11-20T19:30:00Z')]).status, 'no_match')
  })
  test('another town on the same day is not matched automatically', () => {
    const d = decide(row({ name: 'Culture Club', city: 'Glasgow', venue: 'OVO Hydro' }), [ev('cc', 'Culture Club', '2026-11-20T18:30:00Z', 'Utilita Arena', 'Newcastle')])
    assert.notEqual(d.status, 'auto_matched')
  })
})

describe('which See Tickets link an event shows', () => {
  const start = '2026-11-20T19:00:00Z' // 19:00 London
  test('a manual link wins', () => {
    assert.equal(chooseEventUrl('a', start, [{ id: '1', url: 'a', event_time: '19:00', manual: false }, { id: '2', url: 'm', event_time: '18:00', manual: true }]), 'm')
  })
  test('the current link stays when it is still matched (no churn)', () => {
    assert.equal(chooseEventUrl('b', start, [{ id: '1', url: 'a', event_time: '19:00', manual: false }, { id: '2', url: 'b', event_time: '20:00', manual: false }]), 'b')
  })
  test('otherwise the closest start time', () => {
    assert.equal(chooseEventUrl(null, start, [{ id: '1', url: 'a', event_time: '21:00', manual: false }, { id: '2', url: 'b', event_time: '19:00', manual: false }]), 'b')
  })
  test('nothing matched: no link', () => {
    assert.equal(chooseEventUrl('x', start, []), null)
  })
})
