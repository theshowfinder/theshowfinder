import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseSaved, serializeSaved, toggleSaved, removeSaved, isValidSlug, MAX_SAVED } from './savedShows.ts'

describe('parseSaved', () => {
  test('reads a stored list', () => {
    assert.deepEqual(parseSaved('["a-b","c-1"]'), ['a-b', 'c-1'])
  })
  test('survives junk, wrong types and duplicates', () => {
    assert.deepEqual(parseSaved(null), [])
    assert.deepEqual(parseSaved('not json'), [])
    assert.deepEqual(parseSaved('{"a":1}'), [])
    assert.deepEqual(parseSaved('["ok",1,null,"Bad Slug","ok","<script>"]'), ['ok'])
  })
  test('caps the list length', () => {
    const many = JSON.stringify(Array.from({ length: MAX_SAVED + 50 }, (_, i) => `s-${i}`))
    assert.equal(parseSaved(many).length, MAX_SAVED)
  })
})

describe('toggleSaved', () => {
  test('adds newest first, then removes', () => {
    const one = toggleSaved([], 'show-1')
    const two = toggleSaved(one, 'show-2')
    assert.deepEqual(two, ['show-2', 'show-1'])
    assert.deepEqual(toggleSaved(two, 'show-2'), ['show-1'])
  })
  test('ignores invalid slugs', () => {
    assert.deepEqual(toggleSaved(['a'], 'Not Valid!'), ['a'])
  })
  test('remove and serialize round trip', () => {
    assert.deepEqual(parseSaved(serializeSaved(removeSaved(['a', 'b'], 'a'))), ['b'])
    assert.equal(isValidSlug('nickelback-the-o2-2026-10-17'), true)
  })
})
