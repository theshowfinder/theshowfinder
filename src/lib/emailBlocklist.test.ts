import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBlockEmails } from './emailBlocklist.ts'

test('pulls addresses out of pasted text', () => {
  assert.deepEqual(parseBlockEmails('phil.halls@googlemail.com\n7:15 PM\nhello'), ['phil.halls@googlemail.com'])
  assert.deepEqual(parseBlockEmails('From: Bob <Bob@Pub.co.uk>, bob@pub.co.uk; info@venue.com.'), ['bob@pub.co.uk', 'info@venue.com'])
  assert.deepEqual(parseBlockEmails('no address here'), [])
})
