import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEventPast } from './pastEvents.ts'

test('an event is past only a few hours after it starts', () => {
  const now = new Date('2026-10-18T22:00:00Z')
  assert.equal(isEventPast('2026-10-18T19:00:00Z', now), false)
  assert.equal(isEventPast('2026-10-18T15:00:00Z', now), true)
  assert.equal(isEventPast('2026-10-19T19:00:00Z', now), false)
  assert.equal(isEventPast('not a date', now), false)
})
