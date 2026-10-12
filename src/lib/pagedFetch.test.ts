import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages, fetchAllPagesParallel } from './pagedFetch.ts'

// Simulates PostgREST: serves rows from a fixed table but never returns more
// than `serverCap` rows per request, whatever range was asked for.
function fakeTable(total: number, serverCap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: rows.slice(from, Math.min(to + 1, from + serverCap)), error: null }
  }
  return { rows, calls, fetchPage }
}

describe('fetchAllPages — gets every row past the 1000-row server cap', () => {
  test('returns all 2,500 rows when the server caps each response at 1000', async () => {
    const table = fakeTable(2500)
    const all = await fetchAllPages(table.fetchPage)
    assert.equal(all.length, 2500)
    assert.deepEqual(all.map(r => r.id), table.rows.map(r => r.id))
  })

  test('a single short page ends the loop after one request', async () => {
    const table = fakeTable(40)
    const all = await fetchAllPages(table.fetchPage)
    assert.equal(all.length, 40)
    assert.equal(table.calls.length, 1)
  })

  test('an empty table returns an empty array', async () => {
    assert.deepEqual(await fetchAllPages(fakeTable(0).fetchPage), [])
  })

  test('a custom smaller page size is respected', async () => {
    const table = fakeTable(1200)
    const all = await fetchAllPages(table.fetchPage, 500)
    assert.equal(all.length, 1200)
    assert.deepEqual(table.calls, [[0, 499], [500, 999], [1000, 1499]])
  })

  test('a query error is thrown, never swallowed into a partial result', async () => {
    await assert.rejects(
      fetchAllPages(async () => ({ data: null, error: { message: 'statement timeout' } })),
      /statement timeout/,
    )
  })
})

describe('fetchAllPagesParallel — known total, concurrent pages', () => {
  test('returns every row, in order, across several concurrent groups', async () => {
    const table = fakeTable(7300)
    const all = await fetchAllPagesParallel(7300, table.fetchPage, 1000, 3)
    assert.equal(all.length, 7300)
    assert.deepEqual(all.map(r => r.id), table.rows.map(r => r.id))
  })

  test('a zero total makes no requests', async () => {
    const table = fakeTable(0)
    assert.deepEqual(await fetchAllPagesParallel(0, table.fetchPage), [])
    assert.equal(table.calls.length, 0)
  })

  test('an error on any page is thrown', async () => {
    await assert.rejects(
      fetchAllPagesParallel(2500, async (from) => from === 1000
        ? { data: null, error: { message: 'boom' } }
        : { data: [], error: null }),
      /boom/,
    )
  })
})
