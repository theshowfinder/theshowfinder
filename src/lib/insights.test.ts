import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  rankCounts, sharePercent, formatCount, quotableCount, nextMonthRanges,
  insightsHeadline, busiestMonth, categoryLabel, ukDateLabel,
} from './insights.ts'

describe('insights helpers', () => {
  test('rankCounts sorts high to low, drops zeros, breaks ties alphabetically, honours limit', () => {
    const rows = [
      { label: 'Leeds', count: 5 }, { label: 'Bath', count: 5 }, { label: 'York', count: 0 }, { label: 'London', count: 90 },
    ]
    assert.deepEqual(rankCounts(rows).map(r => r.label), ['London', 'Bath', 'Leeds'])
    assert.deepEqual(rankCounts(rows, 2).map(r => r.label), ['London', 'Bath'])
  })

  test('sharePercent rounds and survives a zero total', () => {
    assert.equal(sharePercent(1, 3), 33)
    assert.equal(sharePercent(2, 3), 67)
    assert.equal(sharePercent(5, 0), 0)
  })

  test('formatCount groups thousands', () => {
    assert.equal(formatCount(13421), '13,421')
  })

  test('quotableCount rounds down to a stable figure', () => {
    assert.equal(quotableCount(42), '42')
    assert.equal(quotableCount(437), '430+')
    assert.equal(quotableCount(4370), '4,300+')
    assert.equal(quotableCount(21764), '21,000+')
  })

  test('nextMonthRanges starts at the current month and rolls over the year', () => {
    const r = nextMonthRanges(new Date('2026-11-20T10:00:00Z'), 3)
    assert.deepEqual(r.map(m => m.monthStart), ['2026-11-01', '2026-12-01', '2027-01-01'])
    assert.equal(r[0].label, 'November 2026')
    assert.equal(r[1].endISO, '2027-01-01T00:00:00.000Z')
    assert.equal(r[2].label, 'January 2027')
  })

  test('ukDateLabel formats a UK date', () => {
    assert.equal(ukDateLabel(new Date('2026-10-17T12:00:00Z')), '17 October 2026')
  })

  test('headline names total, top city and top category share', () => {
    const h = insightsHeadline({
      total: 21764,
      cities: [{ label: 'London', count: 9000 }, { label: 'Leeds', count: 300 }],
      categories: [{ label: 'Concerts', count: 10000 }, { label: 'Theatre', count: 7000 }],
      months: [],
    })
    assert.match(h, /^21,000\+ live events are on sale across the UK; London has the most with 9,000; concerts makes up 46%/)
    assert.ok(h.endsWith('.'))
  })

  test('headline still reads with no city or category data', () => {
    assert.equal(insightsHeadline({ total: 0, cities: [], categories: [], months: [] }), '0 live events are on sale across the UK.')
  })

  test('busiestMonth needs two months with data', () => {
    const m = (label: string, count: number) => ({ label, count, monthStart: '2026-01-01' })
    assert.equal(busiestMonth([m('a', 3), m('b', 0)]), null)
    const r = busiestMonth([m('a', 3), m('b', 9), m('c', 1)])
    assert.equal(r?.busiest.label, 'b')
    assert.equal(r?.quietest.label, 'c')
  })

  test('categoryLabel maps known values and capitalises unknown ones', () => {
    assert.equal(categoryLabel('sports'), 'Sport')
    assert.equal(categoryLabel('festival'), 'Festival')
  })
})
