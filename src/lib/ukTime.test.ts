import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ukDate } from './ukTime.ts'

test('just after midnight in British Summer Time is already the next UK day', () => {
  // 23:30 UTC on 23 Oct 2026 = 00:30 BST on 24 Oct
  assert.equal(ukDate('2026-10-23T23:30:00Z'), '2026-10-24')
  assert.equal(new Date('2026-10-23T23:30:00Z').toISOString().slice(0, 10), '2026-10-23')
})

test('in winter UK time is UTC', () => {
  assert.equal(ukDate('2026-12-01T23:30:00Z'), '2026-12-01')
})
