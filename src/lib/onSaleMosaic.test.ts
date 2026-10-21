import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rankOnSaleGroups, mosaicTileCount, pickOnSaleMosaic, venueSize, isFixtureTitle } from './onSaleMosaic.ts'

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

describe('football and other match fixtures stay out of the homepage block', () => {
  const show = (name: string, title: string, venue: string) => ({ name, onsale_date: '2026-10-21', events: [{ title, venue_name: venue, venue_capacity: null }] })
  test('isFixtureTitle: matches and clubs yes, tours and darts no', () => {
    for (const t of ['Blackburn Rovers V Norwich City', 'Blackburn Rovers v Derby County', 'England vs Australia', 'Derby County FC', 'Women\'s Football: Lionesses'])
      assert.equal(isFixtureTitle(t), true, t)
    for (const t of ['Jack Johnson', 'BetMGM Premier League Darts', 'KENSHI YONEZU 2026-2027 WORLD TOUR / GHOST', 'Jimmy Carr - Killing Jokes', 'Dave: Live'])
      assert.equal(isFixtureTitle(t), false, t)
  })
  test('the big Ewood Park fixtures no longer lead; real shows take the tiles', () => {
    const picked = pickOnSaleMosaic([
      show('Blackburn Rovers V Norwich City', 'Blackburn Rovers V Norwich City', 'Ewood Park'),
      show('Blackburn Rovers v Derby County', 'Blackburn Rovers v Derby County', 'Ewood Park'),
      show('Jack Johnson', 'Jack Johnson', 'The O2'),
      show('Toto', 'Toto', 'Utilita Arena Birmingham'),
      show('Small act', 'Small act', 'YES Basement'),
    ])
    assert.deepEqual(picked.map(p => p.name).sort(), ['Jack Johnson', 'Small act', 'Toto'])
  })
})
