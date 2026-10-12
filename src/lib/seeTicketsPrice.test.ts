import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pickSeeTicketsPrice } from './seeTicketsPrice.ts'

describe('pickSeeTicketsPrice', () => {
  test('uses the listing min and max', () => {
    assert.deepEqual(pickSeeTicketsPrice([{ min_price: 32.95, max_price: 56.6 }]), { from: 32.95, to: 56.6 })
  })
  test('accepts numeric strings (Postgres numeric comes back as text)', () => {
    assert.deepEqual(pickSeeTicketsPrice([{ min_price: '22', max_price: '27.5' }]), { from: 22, to: 27.5 })
  })
  test('ignores implausibly low minimums', () => {
    assert.equal(pickSeeTicketsPrice([{ min_price: 1.25, max_price: 24.75 }]), null)
    assert.deepEqual(pickSeeTicketsPrice([{ min_price: 1, max_price: 45 }, { min_price: 30, max_price: 40 }]), { from: 30, to: 40 })
  })
  test('lowest min and highest max across several listings', () => {
    assert.deepEqual(
      pickSeeTicketsPrice([{ min_price: 40, max_price: 60 }, { min_price: 25, max_price: 90 }]),
      { from: 25, to: 90 },
    )
  })
  test('no range when max is missing or not above min', () => {
    assert.deepEqual(pickSeeTicketsPrice([{ min_price: 20, max_price: null }]), { from: 20, to: null })
    assert.deepEqual(pickSeeTicketsPrice([{ min_price: 20, max_price: 20 }]), { from: 20, to: null })
  })
  test('empty / null / garbage input gives null', () => {
    assert.equal(pickSeeTicketsPrice([]), null)
    assert.equal(pickSeeTicketsPrice(null), null)
    assert.equal(pickSeeTicketsPrice([{ min_price: 'abc', max_price: null }]), null)
    assert.equal(pickSeeTicketsPrice([{ min_price: null, max_price: null }]), null)
  })
})
