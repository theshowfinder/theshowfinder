import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rankOnSaleGroups, mosaicTileCount, pickOnSaleMosaic, venueSize } from './onSaleMosaic.ts'

const g = (name: string, onsale: string, cap: number | null) => ({ name, onsale_date: onsale, events: [{ venue_capacity: cap }] })

describe('onSaleMosaic', () => {
  test('venue size falls back to the name when no capacity is on record', () => {
    assert.equal(venueSize('Hyde Park', null), 8000)
    assert.equal(venueSize('OVO Hydro', null), 8000)
    assert.equal(venueSize('LNER Community Stadium', undefined), 8000)
    assert.equal(venueSize('O2 Academy Leeds', null), 1800)
    assert.equal(venueSize('YES Basement', null), 300)
    assert.equal(venueSize('Hyde Park', 65000), 65000)
  })
  test('a stadium show with no capacity on record still outranks small rooms', () => {
    const groups = [
      { name: 'Harpy', onsale_date: '2026-10-19', events: [{ venue_name: 'YES Basement', venue_capacity: null }] },
      { name: 'Alice Faye', onsale_date: '2026-10-19', events: [{ venue_name: 'The Louisiana', venue_capacity: null }] },
      { name: 'Jim E Brown', onsale_date: '2026-10-19', events: [{ venue_name: 'O2 Academy Leeds', venue_capacity: null }] },
      { name: 'Bon Jovi', onsale_date: '2026-10-19', events: [{ venue_name: 'Hyde Park', venue_capacity: null }] },
    ]
    assert.deepEqual(rankOnSaleGroups(groups).map(g => g.name), ['Bon Jovi', 'Jim E Brown', 'Harpy', 'Alice Faye'])
  })
  test('biggest venue leads, ties go to the earliest sale', () => {
    const ranked = rankOnSaleGroups([g('small', '2026-10-21', 300), g('arena', '2026-10-23', 12000), g('arena2', '2026-10-22', 12000), g('unknown', '2026-10-20', null)])
    assert.deepEqual(ranked.map(x => x.name), ['arena2', 'arena', 'unknown', 'small'])
  })
  test('tile count always fills whole rows', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 40].map(n => mosaicTileCount(n)), [0, 1, 2, 3, 4, 5, 5, 5, 9, 9, 9])
  })
  test('picks the top tiles only', () => {
    const many = Array.from({ length: 20 }, (_, i) => g(`s${i}`, '2026-10-21', i * 100))
    const picked = pickOnSaleMosaic(many)
    assert.equal(picked.length, 9)
    assert.equal(picked[0].name, 's19')
  })
})
