import { test } from 'node:test'
import assert from 'node:assert/strict'
import { excludePreviouslyShown } from './cityDisplayRows.ts'

test('city sections show a listing once without dropping a different date', () => {
  const shown = new Set(['featured'])
  const week = excludePreviouslyShown([{ id: 'featured' }, { id: 'friday' }, { id: 'saturday' }], shown)
  const recent = excludePreviouslyShown([{ id: 'friday' }, { id: 'saturday' }, { id: 'later' }], shown)

  assert.deepEqual(week.map(row => row.id), ['friday', 'saturday'])
  assert.deepEqual(recent.map(row => row.id), ['later'])
  assert.deepEqual([...shown], ['featured', 'friday', 'saturday', 'later'])
})

test('a section limit counts only new rows and does not change the input', () => {
  const rows = [{ id: 'seen' }, { id: 'one' }, { id: 'two' }]
  const shown = new Set(['seen'])
  assert.deepEqual(excludePreviouslyShown(rows, shown, 1).map(row => row.id), ['one'])
  assert.deepEqual(rows.map(row => row.id), ['seen', 'one', 'two'])
  assert.equal(shown.has('two'), false)
  assert.deepEqual(excludePreviouslyShown(rows, shown, 0), [])
})
