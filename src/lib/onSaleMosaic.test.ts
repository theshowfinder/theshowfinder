import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rankOnSaleGroups, mosaicTileCount, pickOnSaleMosaic } from './onSaleMosaic.ts'

const g = (name: string, onsale: string, cap: number | null) => ({ name, onsale_date: onsale, events: [{ venue_capacity: cap }] })

describe('onSaleMosaic', () => {
  test('biggest venue leads, ties go to the earliest sale', () => {
    const ranked = rankOnSaleGroups([g('small', '2026-10-21', 300), g('arena', '2026-10-23', 12000), g('arena2', '2026-10-22', 12000), g('unknown', '2026-10-20', null)])
    assert.deepEqual(ranked.map(x => x.name), ['arena2', 'arena', 'small', 'unknown'])
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
