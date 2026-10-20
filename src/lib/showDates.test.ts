import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { teaser, groupDatesByCity, type ShowDate } from './showDates.ts'

const d = (id: string, date: string, city: string): ShowDate => ({ id, slug: id, start_date: `${date}T19:00:00Z`, status: 'upcoming', venue_name: 'V', venue_city: city })

describe('teaser', () => {
  test('home tile: names the next cities and counts the rest', () => {
    assert.deepEqual(teaser(['Leeds', 'Glasgow', 'London', 'Bath'], 13, 'Manchester', true), { listed: ['Leeds', 'Glasgow'], more: 11 })
  })
  test('not the visitor\'s city: the tile\'s own city is not "other"', () => {
    assert.deepEqual(teaser(['Birmingham', 'Liverpool', 'Leeds', 'London'], 4, 'Birmingham', false), { listed: ['Liverpool', 'Leeds'], more: 1 })
  })
  test('nothing else to name', () => {
    assert.deepEqual(teaser([], 0, 'Derby', true), { listed: [], more: 0 })
  })
})

describe('groupDatesByCity', () => {
  const dates = [d('a', '2027-01-20', 'Glasgow'), d('b', '2027-01-24', 'Manchester'), d('c', '2027-01-21', 'Newcastle'), d('d', '2027-02-01', 'Manchester')]
  test('visitor city first, then cities by soonest date', () => {
    const g = groupDatesByCity(dates, 'manchester')
    assert.deepEqual(g.map(x => x.city), ['Manchester', 'Glasgow', 'Newcastle'])
    assert.equal(g[0].isHome, true)
    assert.deepEqual(g[0].dates.map(x => x.id), ['b', 'd'])
  })
  test('no city known: soonest city first', () => {
    assert.deepEqual(groupDatesByCity(dates, null).map(x => x.city), ['Glasgow', 'Newcastle', 'Manchester'])
  })
})
