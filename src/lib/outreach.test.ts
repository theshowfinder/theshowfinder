import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOutreachEmail, canEmail, type Prospect } from './outreach.ts'

const p: Prospect = {
  id: 'x', business_name: 'The Blue Door', category: 'Restaurant', city: 'Manchester', near_venue: 'Co-op Live',
  distance_label: 'a 6-minute walk from Co-op Live', email: 'info@bluedoor.co.uk', company_type: 'ltd', status: 'approved',
  ref_code: 'abc123', unsubscribe_token: 'tok',
}

test('first email: personal, offer link, unsubscribe, no numbers', () => {
  const e = buildOutreachEmail(p, 'first')
  assert.match(e.subject, /The Blue Door/)
  assert.match(e.text, /Co-op Live/)
  assert.match(e.text, /first month is free/)
  assert.match(e.text, /\/p\/abc123/)
  assert.match(e.text, /\/unsubscribe\/tok/)
  assert.match(e.html, /Unsubscribe/)
  assert.doesNotMatch(e.text, /visitors|clicks|views a month/i)
})

test('follow-up says it is the last one', () => {
  assert.match(buildOutreachEmail(p, 'follow_up').text, /won't follow up again/)
})

test('PECR: only limited companies or businesses that said yes', () => {
  assert.equal(canEmail(p), true)
  assert.equal(canEmail({ ...p, company_type: 'sole_trader' }), false)
  assert.equal(canEmail({ ...p, company_type: 'unknown' }), false)
  assert.equal(canEmail({ ...p, company_type: 'consented' }), true)
  assert.equal(canEmail({ ...p, status: 'unsubscribed' }), false)
})
