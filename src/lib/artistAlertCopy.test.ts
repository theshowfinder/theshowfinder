import test from 'node:test'
import assert from 'node:assert/strict'
import { artistAlertCopy } from './artistAlertCopy.ts'

test('artist alert copy fits the situation', () => {
  assert.match(artistAlertCopy('Kasabian', {}).heading, /Kasabian presale alerts/)
  assert.match(artistAlertCopy('Kasabian', { soldOut: true }).heading, /Sold out/)
  assert.match(artistAlertCopy('Kasabian', { hasDates: false }).blurb, /No UK dates/)
  // Never promises presale codes or on-sale times: the follow email only lists new dates.
  for (const c of [artistAlertCopy('X', {}), artistAlertCopy('X', { soldOut: true }), artistAlertCopy('X', { hasDates: false })]) {
    assert.doesNotMatch(c.blurb, /code|on-sale time/i)
  }
})
