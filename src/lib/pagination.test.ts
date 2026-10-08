import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { clampPage } from './pagination.ts'

describe('clampPage', () => {
  test('keeps a valid page unchanged', () => {
    assert.equal(clampPage(3, 10), 3)
  })

  test('moves an out-of-range page to the final valid page', () => {
    assert.equal(clampPage(3218, 24), 24)
  })

  test('normalises invalid and fractional pages', () => {
    assert.equal(clampPage(0, 10), 1)
    assert.equal(clampPage(-2, 10), 1)
    assert.equal(clampPage(Number.NaN, 10), 1)
    assert.equal(clampPage(2.9, 10), 2)
  })

  test('returns page one when there are no pages', () => {
    assert.equal(clampPage(4, 0), 1)
  })
})
