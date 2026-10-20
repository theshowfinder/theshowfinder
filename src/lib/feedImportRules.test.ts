import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { skipReason, londonToUtcIso, type FeedRow, type KnownEvent } from './feedImportRules.ts'

const today = '2026-10-20'
const row = (over: Partial<FeedRow> = {}): FeedRow => ({ id: 1, name: 'Black Stone Cherry', event_date: '2026-11-20', venue: 'Rock City Nottingham', city: 'Nottingham', url: 'https://x/1', ...over })
const known = (over: Partial<KnownEvent> = {}): KnownEvent => ({ title: 'Some Other Band', date: '2026-11-20', city: 'Nottingham', venue: 'Rock City', ...over })

describe('skipReason', () => {
  test('a real show with nothing like it on the day may be imported', () => {
    assert.equal(skipReason(row(), [], today), null)
    assert.equal(skipReason(row(), [known()], today), null)   // another band in the same room is fine
  })
  test('the same show under a sponsor-style title is a duplicate (Cremonini case)', () => {
    const r = row({ name: 'Cesare Cremonini', venue: "O2 Shepherd's Bush Empire", city: 'London' })
    const e = known({ title: 'Mastercard Presents: Cremonini - Amateur Live (One Night in London)', city: 'London', venue: 'O2 Shepherds Bush Empire' })
    assert.equal(skipReason(r, [e], today), 'duplicate')
  })
  test('same title at a different venue in the same city is still a duplicate; another city is not', () => {
    assert.equal(skipReason(row(), [known({ title: 'Black Stone Cherry', venue: 'Rock City' })], today), 'duplicate')
    assert.equal(skipReason(row(), [known({ title: 'Black Stone Cherry', city: 'Leeds', venue: 'O2 Academy' })], today), null)
  })
  test('packages, past shows, missing venue/city/link and junk names are never imported', () => {
    assert.equal(skipReason(row({ name: 'Gladiators Live - Venue Premium Tickets' }), [], today), 'package')
    assert.equal(skipReason(row({ event_date: '2026-10-20' }), [], today), 'not_in_future')
    assert.equal(skipReason(row({ venue: ' ' }), [], today), 'no_venue_or_city')
    assert.equal(skipReason(row({ city: null }), [], today), 'no_venue_or_city')
    assert.equal(skipReason(row({ url: null }), [], today), 'no_link')
    assert.equal(skipReason(row({ name: '??' }), [], today), 'bad_name')
  })
})

describe('londonToUtcIso', () => {
  test('summer (BST) shows are an hour earlier in UTC, winter (GMT) the same', () => {
    assert.equal(londonToUtcIso('2027-06-24', '19:30:00'), '2027-06-24T18:30:00.000Z')
    assert.equal(londonToUtcIso('2027-01-20', '19:30'), '2027-01-20T19:30:00.000Z')
    assert.equal(londonToUtcIso('2026-11-20', null), '2026-11-20T19:00:00.000Z')
  })
})
